/**
 * The parts of `test` that imitate the sandbox around the code: where fetch may
 * go, what survives between runs, and how the Docker container is started.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const CLI = fileURLToPath(new URL("../packages/cli/dist/index.js", import.meta.url))

async function source(name) {
    const entry = fileURLToPath(new URL(`../packages/cli/src/${name}.ts`, import.meta.url))
    const out = await build({ entryPoints: [entry], write: false, format: "esm", bundle: true, platform: "node" })
    return import("data:text/javascript," + encodeURIComponent(out.outputFiles[0].text))
}

function va(cwd, ...args) {
    const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" })
    return { code: run.status, out: `${run.stdout}${run.stderr}` }
}

/** Like va, without blocking this process — for a test that serves requests the CLI makes. */
function vaAsync(cwd, ...args) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [CLI, ...args], { cwd })
        let out = ""
        child.stdout.on("data", (chunk) => (out += chunk))
        child.stderr.on("data", (chunk) => (out += chunk))
        child.on("close", (code) => resolve({ code, out }))
    })
}

function scratch() {
    const dir = mkdtempSync(join(tmpdir(), "va-local-"))
    test.after(() => rmSync(dir, { recursive: true, force: true }))
    return dir
}

function write(dir, files) {
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(join(dir, path, ".."), { recursive: true })
        writeFileSync(join(dir, path), typeof text === "string" ? text : JSON.stringify(text))
    }
}

// ─── egress ─────────────────────────────────────────────────────────────────

test("the egress policy is the platform's: declared hosts, config hosts, subdomains, never private", async () => {
    const { policyFor, permits } = await source("egress")

    const policy = policyFor(["api.example.com", "http://localhost:3000"], { url: "https://hooks.slack.com/x", note: "not.a host really" })
    assert.equal(policy.enforce, true)
    assert.deepEqual(policy.hosts, ["api.example.com", "hooks.slack.com"])
    assert.ok(permits(policy, "api.example.com"))
    assert.ok(permits(policy, "eu.api.example.com"), "a declared host covers its subdomains")
    assert.ok(permits(policy, "hooks.slack.com"), "a host typed into the config is permitted for that run")
    assert.ok(!permits(policy, "example.com"))
    assert.ok(!permits(policy, "localhost"), "loopback is never on the list")

    assert.equal(policyFor(undefined, {}).enforce, false)
    assert.ok(permits(policyFor(["*"], {}), "anything.io"))
    assert.deepEqual(policyFor([], { _trigger: { link: "https://mail.example" } }).hosts, [], "underscored keys are not the user's")
})

test("fetch outside allowedDomains is refused, and without the list it is only reported", async () => {
    const server = createServer((req, res) => res.end("ok"))
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    test.after(() => server.close())
    const url = `http://127.0.0.1:${server.address().port}/`

    const dir = scratch()
    write(dir, {
        "manifest.json": { name: "p", outputs: ["success"] },
        "index.js": `module.exports = { execute: async (input, config) => { const r = await fetch(${JSON.stringify(url)}); return { output: "success", data: { body: await r.text() } } } }\n`,
    })

    const reported = await vaAsync(dir, "test")
    assert.equal(reported.code, 0, reported.out)
    assert.match(reported.out, /! egress 127\.0\.0\.1 is not allowed on the platform/)

    write(dir, { "visualautomate.test.json": { config: {}, input: {}, allowedDomains: ["api.example.com"] } })
    const blocked = await vaAsync(dir, "test")
    assert.equal(blocked.code, 1)
    assert.match(blocked.out, /not allowed to contact 127\.0\.0\.1/)
    assert.match(blocked.out, /egress   blocked 127\.0\.0\.1/)

    write(dir, { "visualautomate.test.json": { config: {}, input: {}, allowedDomains: "api.example.com" } })
    assert.match((await vaAsync(dir, "test")).out, /"allowedDomains" must be a list/)
})

// ─── persist ────────────────────────────────────────────────────────────────

test("with --persist, storage and state carry over between runs and stay inside their folder", () => {
    const dir = scratch()
    write(dir, {
        "manifest.json": { name: "counter", outputs: ["success"] },
        "index.js": `module.exports = { execute: async (input, config, context) => {
            const runs = ((await context.state.get("runs")) ?? 0) + 1
            await context.state.set("runs", runs)
            await context.storage.put("log/run-" + runs + ".txt", "run " + runs)
            await context.storage.put("../../escaped.txt", "nope")
            if (runs === 2) await context.storage.delete("log/run-1.txt")
            return { output: "success", data: { runs } }
        } }\n`,
    })

    const first = va(dir, "test", "--persist")
    assert.equal(first.code, 0, first.out)
    assert.match(first.out, /"runs": 1/)
    assert.match(first.out, /points outside the storage folder/)
    assert.equal(readFileSync(join(dir, ".visualautomate/storage/log/run-1.txt"), "utf8"), "run 1")
    assert.ok(!existsSync(join(dir, "..", "escaped.txt")))

    // The folder exists now, so no flag is needed.
    const second = va(dir, "test")
    assert.match(second.out, /"runs": 2/)
    assert.deepEqual(JSON.parse(readFileSync(join(dir, ".visualautomate/state.json"), "utf8")), { runs: 2 })
    assert.ok(!existsSync(join(dir, ".visualautomate/storage/log/run-1.txt")), "a file the run deleted is gone from disk")
    assert.ok(existsSync(join(dir, ".visualautomate/storage/log/run-2.txt")))
})

test("storage paths are kept inside the storage folder", async () => {
    const { diskPathFor } = await source("persist")
    const root = join(tmpdir(), "va-root", "storage")
    assert.equal(diskPathFor(root, "a/b.txt"), join(root, "a", "b.txt"))
    for (const bad of ["../x", "a/../../x", "", "/etc/passwd", "a\0b"]) {
        assert.equal(diskPathFor(root, bad), null, bad)
    }
})

// ─── docker ─────────────────────────────────────────────────────────────────

test("the container gets the tier's limits, no privileges and only the project", async () => {
    const { dockerArgs, forwardedFlags, tierOf } = await source("docker")
    const args = dockerArgs({
        cwd: "/home/me/plugin",
        image: "ghcr.io/visualautomate/plugin-sandbox:1.0.0",
        tier: "boosted",
        args: ["test", "--module", "send"],
        user: { uid: 1000, gid: 1000 },
    })
    const after = (flag) => args[args.indexOf(flag) + 1]

    assert.equal(after("--cpus"), "0.5")
    assert.equal(after("--memory"), "4g")
    assert.equal(after("--memory-swap"), "4g", "swap would let a run use more than its tier")
    assert.equal(after("--volume"), "/home/me/plugin:/work")
    assert.equal(after("--user"), "1000:1000")
    assert.ok(args.includes("--read-only"))
    assert.equal(after("--cap-drop"), "ALL")
    assert.equal(after("--security-opt"), "no-new-privileges")
    assert.deepEqual(args.slice(-4), ["ghcr.io/visualautomate/plugin-sandbox:1.0.0", "test", "--module", "send"])
    assert.equal(args.filter((a) => a === "--volume").length, 1, "only the project is mounted")

    assert.deepEqual(forwardedFlags({ docker: "true", tier: "max", image: "x", persist: "true", input: "a.json" }), ["--persist", "--input", "a.json"])
    const { explainExit } = await source("docker")
    assert.match(explainExit(137, "standard"), /more than the 1 GB of memory the standard tier has[\s\S]*--tier boosted/)
    assert.doesNotMatch(explainExit(137, "max"), /--tier/, "there is no bigger tier to suggest")
    assert.equal(explainExit(1, "standard"), null, "a failed test explains itself")

    assert.equal(tierOf(undefined), "standard")
    assert.throws(() => tierOf("huge"), /Unknown tier "huge"/)
})

test("--version prints the version the package was built with", () => {
    const { version } = JSON.parse(readFileSync(new URL("../packages/cli/package.json", import.meta.url), "utf8"))
    assert.equal(va(tmpdir(), "--version").out.trim(), version)
})

test("vsa is the command, with va and visualautomate as the same binary", () => {
    const pkg = JSON.parse(readFileSync(new URL("../packages/cli/package.json", import.meta.url), "utf8"))
    assert.deepEqual(Object.keys(pkg.bin).sort(), ["va", "visualautomate", "vsa"])
    assert.equal(new Set(Object.values(pkg.bin)).size, 1, "all three run the same file")

    const help = va(tmpdir()).out
    assert.match(help, /vsa dev \[<module>\]\s+the sandbox/)
    assert.match(help, /--local\s+`dev` without the sandbox/)
})

// ─── colour ─────────────────────────────────────────────────────────────────

test("colour follows the terminal, and is carried into the container", async () => {
    const dir = scratch()
    write(dir, {
        "manifest.json": { name: "p", outputs: ["success"] },
        "index.js": `module.exports = { execute: async () => ({ output: "success" }) }\n`,
    })

    const run = (env) => {
        const result = spawnSync(process.execPath, [CLI, "test"], { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } })
        return `${result.stdout}${result.stderr}`
    }

    assert.match(run({ FORCE_COLOR: "1", NO_COLOR: "" }), /\x1b\[32m/, "green for a run that passed")
    assert.doesNotMatch(run({ NO_COLOR: "1", FORCE_COLOR: "" }), /\x1b\[/, "NO_COLOR means no escape codes at all")
    // Not a terminal and nothing asked for: a log file or a CI run stays plain.
    assert.doesNotMatch(run({ FORCE_COLOR: "", NO_COLOR: "" }), /\x1b\[/)

    // The container's stdout is a pipe to Docker, so what this terminal wants is
    // passed in rather than worked out again in there.
    const { dockerArgs } = await source("docker")
    const args = dockerArgs({ cwd: "/p", image: "img", tier: "standard", args: ["test"] })
    const env = args[args.indexOf("--env") + 1]
    assert.match(env, /^(FORCE_COLOR=1|NO_COLOR=1)$/, `passed ${env}`)
})
