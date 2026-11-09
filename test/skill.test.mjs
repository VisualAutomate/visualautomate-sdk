/**
 * The AI skill, held to the platform it teaches.
 *
 * An assistant copies what the skill shows. So every example in it is checked
 * the way the platform checks a push, the generated lists in its sandbox
 * reference are the SDK's own, and the copy the CLI installs is byte for byte
 * the one in this repository. A skill that drifted from the platform would have
 * assistants write steps the platform refuses, which is worse than no skill.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { checkManifest, loadPluginCode, sandboxRequire, simulate, validatePluginCode } from "../packages/plugin-sdk/dist/index.mjs"
import { filled, SANDBOX_MD } from "../scripts/sync-skill.mjs"

const SKILL = fileURLToPath(new URL("../skills/visualautomate-steps", import.meta.url))
const EXAMPLES = join(SKILL, "examples")
const CLI = fileURLToPath(new URL("../packages/cli/dist/index.js", import.meta.url))

/** What a local run leaves behind, which the build leaves out of the skill too. */
const LOCAL_ONLY = new Set(["visualautomate.d.ts", "jsconfig.json", ".visualautomate", "node_modules", ".DS_Store"])

/** Examples that run with no network, no connected account and no extra package. */
const RUNNABLE = ["hello-world", "branching-outputs", "secrets", "state-dedupe", "storage-files", "storage-paths-media"]

/** The platform's own lists (lib/plugins/manifest.ts in the app). */
const KNOWN_BLOCKS = new Set(["properties", "inputs", "outputs", "outputFields", "auth", "trigger", "action", "timeoutMs", "memoryLimitMb", "icon", "color", "description", "version"])
const PROPERTY_TYPES = new Set(["string", "number", "boolean", "select", "multiselect", "json", "code", "color", "date", "connection", "file", "path", "paths", "secret"])

function env(extra = {}) {
    const e = { ...process.env, NO_COLOR: "1", ...extra }
    delete e.FORCE_COLOR
    return e
}

function vsa(cwd, args, extra) {
    const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: env(extra) })
    return { code: run.status, out: `${run.stdout}${run.stderr}` }
}

function scratch() {
    const dir = mkdtempSync(join(tmpdir(), "va-skill-"))
    test.after(() => rmSync(dir, { recursive: true, force: true }))
    return dir
}

/** Every file under `dir`, by path relative to it, skipping what a local run writes. */
function filesUnder(dir) {
    const out = {}
    const walk = (at) => {
        for (const name of readdirSync(at)) {
            if (LOCAL_ONLY.has(name)) continue
            const path = join(at, name)
            if (statSync(path).isDirectory()) walk(path)
            else out[relative(dir, path).split("\\").join("/")] = readFileSync(path, "utf8")
        }
    }
    walk(dir)
    return out
}

const isDir = (path) => statSync(path).isDirectory()
const APPS = join(EXAMPLES, "apps")

/** The plugin examples: every folder in examples/ but apps/. */
const plugins = readdirSync(EXAMPLES).filter((name) => name !== "apps" && isDir(join(EXAMPLES, name)))

/** The app examples, each with its modules. */
const apps = readdirSync(APPS)
    .filter((name) => isDir(join(APPS, name)))
    .map((name) => ({
        name,
        modules: readdirSync(join(APPS, name, "modules")).filter((m) => isDir(join(APPS, name, "modules", m))),
    }))

/** Every step folder, plugin or module, by its path under examples/. */
const examples = [
    ...plugins,
    ...apps.flatMap((app) => app.modules.map((m) => `apps/${app.name}/modules/${m}`)),
]
const manifestOf = (name) => JSON.parse(readFileSync(join(EXAMPLES, name, "manifest.json"), "utf8"))

test("SKILL.md has the frontmatter a skill is found by", () => {
    const text = readFileSync(join(SKILL, "SKILL.md"), "utf8")
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)
    assert.ok(front, "SKILL.md starts with --- frontmatter ---")
    const name = /^name: (.+)$/m.exec(front[1])?.[1]
    const description = /^description: (.+)$/m.exec(front[1])?.[1]
    assert.equal(name, "visualautomate-steps")
    assert.match(name, /^[a-z0-9-]{1,64}$/)
    assert.ok(description && description.length > 50 && description.length <= 1024, `description is ${description?.length} characters`)
})

test("every file SKILL.md points to is there", () => {
    const text = readFileSync(join(SKILL, "SKILL.md"), "utf8")
    const named = [...text.matchAll(/`((?:references|examples)\/[a-z0-9./-]*)`/g)].map((m) => m[1])
    assert.ok(named.length >= 6)
    for (const path of named) assert.ok(existsSync(join(SKILL, path)), `${path} is named in SKILL.md but missing`)
})

test("the sandbox reference lists exactly the SDK's packages, patterns and blocked globals", () => {
    const text = readFileSync(SANDBOX_MD, "utf8")
    assert.equal(text, filled(text), "references/sandbox.md is out of date: run `npm run build && node scripts/sync-skill.mjs`")
})

test("the examples index lists every example, and nothing else", () => {
    const readme = readFileSync(join(EXAMPLES, "README.md"), "utf8")
    const listed = [...readme.matchAll(/^\| `([a-z0-9-]+)\/` \|/gm)].map((m) => m[1]).sort()
    assert.deepEqual(listed, [...plugins, "apps"].sort())

    const appsReadme = readFileSync(join(APPS, "README.md"), "utf8")
    const listedApps = [...appsReadme.matchAll(/^\| `([a-z0-9-]+)\/` \|/gm)].map((m) => m[1]).sort()
    assert.deepEqual(listedApps, apps.map((a) => a.name).sort())
    for (const app of apps) {
        const own = readFileSync(join(APPS, app.name, "README.md"), "utf8")
        for (const m of app.modules) assert.match(own, new RegExp(`\\| \`${m}\` \\|`), `apps/${app.name}/README.md lists ${m}`)
    }
})

test("every example's manifest passes the SDK's manifest check, with no warnings", () => {
    for (const name of examples) {
        const check = checkManifest(manifestOf(name), existsSync(join(EXAMPLES, name, "index.js")))
        assert.deepEqual(check.errors, [], `${name}: ${check.errors.join("; ")}`)
        assert.deepEqual(check.warnings, [], `${name}: ${check.warnings.join("; ")}`)
    }
})

test("vsa test at the root of an app without code checks every module", () => {
    const dir = scratch()
    cpSync(join(APPS, "github"), join(dir, "github"), { recursive: true })
    const run = vsa(join(dir, "github"), ["test"])
    assert.equal(run.code, 0, run.out)
    assert.match(run.out, /4 of 4 passed/)
    assert.equal(run.out.match(/✓ checked/g)?.length, 4)
})

test("the modules of one app act as the same account", () => {
    for (const app of apps) {
        const accounts = new Set()
        for (const m of app.modules) {
            const manifest = manifestOf(`apps/${app.name}/modules/${m}`)
            const connection = Object.values(manifest.properties ?? {}).find((p) => p.type === "connection")
            if (connection) accounts.add(`${connection.provider} ${JSON.stringify(manifest.auth)}`)
        }
        assert.ok(accounts.size <= 1, `apps/${app.name}: modules disagree on the account: ${[...accounts].join(" / ")}`)
    }
})

test("every app has at least one module, and the set covers apps with and without code", () => {
    const hasCode = (app) => app.modules.some((m) => existsSync(join(APPS, app.name, "modules", m, "index.js")))
    assert.ok(apps.every((app) => app.modules.length > 0))
    assert.ok(apps.some((app) => !hasCode(app)), "an app without code")
    assert.ok(apps.some(hasCode), "an app with code")
})

test("an app's runnable code modules pass `vsa test` from the app's root", () => {
    const dir = scratch()
    cpSync(join(APPS, "deepl"), join(dir, "deepl"), { recursive: true })
    const run = vsa(join(dir, "deepl"), ["test", "translate-long-text"])
    assert.equal(run.code, 0, run.out)
    assert.match(run.out, /passed/)
})

test("every example's code passes the platform's code check", () => {
    for (const name of examples) {
        const path = join(EXAMPLES, name, "index.js")
        if (!existsSync(path)) continue
        const check = validatePluginCode(readFileSync(path, "utf8"))
        assert.ok(check.valid, `${name}: ${check.error}`)
    }
})

test("every example's manifest keeps to what the platform accepts", () => {
    for (const name of examples) {
        const m = manifestOf(name)
        const where = `${name}/manifest.json`
        for (const key of Object.keys(m)) assert.ok(KNOWN_BLOCKS.has(key), `${where}: "${key}" would be dropped on save`)
        assert.ok(typeof m.description === "string" && m.description.length > 0, `${where}: a description`)
        assert.ok(Array.isArray(m.outputs) && m.outputs.length > 0, `${where}: outputs`)

        const properties = m.properties ?? {}
        for (const [key, property] of Object.entries(properties)) {
            assert.ok(PROPERTY_TYPES.has(property.type), `${where}: ${key} has type "${property.type}"`)
            assert.ok(typeof property.label === "string" && property.label.length > 0, `${where}: ${key} has a label`)
        }
        for (const forbidden of ["url", "baseUrl", "base_url", "host"]) {
            assert.ok(!(m.auth && forbidden in m.auth), `${where}: auth may not name a host (${forbidden})`)
        }

        // Every {{config.x}} in a declaration names a field that exists.
        const declared = JSON.stringify({ action: m.action, trigger: m.trigger })
        for (const [, key] of declared.matchAll(/\{\{\s*config\.([A-Za-z0-9_]+)/g)) {
            assert.ok(key in properties, `${where}: {{config.${key}}} names no property`)
        }
        const isConnection = (key) => properties[key]?.type === "connection"

        if (m.action) {
            assert.ok(!existsSync(join(EXAMPLES, name, "index.js")), `${where}: a declared step has no index.js`)
            if (m.action.request) {
                const viaConnection = "connection" in m.action
                const viaBaseUrl = "baseUrl" in m.action
                assert.ok(viaConnection !== viaBaseUrl, `${where}: exactly one of connection and baseUrl`)
                if (viaConnection) assert.ok(isConnection(m.action.connection), `${where}: action.connection names a connection property`)
                if (viaBaseUrl) {
                    assert.match(m.action.baseUrl, /^https:\/\//, `${where}: baseUrl is https`)
                    assert.doesNotMatch(m.action.baseUrl, /\{\{\s*input\./, `${where}: baseUrl may not read input`)
                }
                assert.doesNotMatch(m.action.request.path, /^[a-z]+:\/\//i, `${where}: request.path is relative`)
            }
            assert.ok(m.action.outputs && Object.keys(m.action.outputs).length > 0, `${where}: action.outputs`)
        }

        if (m.trigger) {
            const t = m.trigger
            assert.ok(isConnection(t.connection), `${where}: trigger.connection names a connection property`)
            assert.ok(typeof t.items === "string" && typeof t.id === "string", `${where}: trigger.items and trigger.id`)
            assert.doesNotMatch(t.request.path, /^[a-z]+:\/\//i, `${where}: trigger.request.path is relative`)
            assert.equal(t.cursor?.initial, "now", `${where}: a trigger starts from now`)
            assert.deepEqual(m.inputs ?? [], [], `${where}: a trigger has no inputs`)
        }
    }
})

test("the runnable examples pass `vsa test`, as the push check would run them", () => {
    const dir = scratch()
    for (const name of RUNNABLE) {
        cpSync(join(EXAMPLES, name), join(dir, name), { recursive: true })
        const run = vsa(join(dir, name), ["test"])
        assert.equal(run.code, 0, `${name}:\n${run.out}`)
        assert.match(run.out, /passed/)
    }
})

test("an example that acts as an account runs without one, as the push check runs it when no account is named", () => {
    const dir = scratch()
    cpSync(join(EXAMPLES, "connection-account"), join(dir, "connection-account"), { recursive: true })
    const run = vsa(join(dir, "connection-account"), ["test"])
    assert.equal(run.code, 0, run.out)
    assert.match(run.out, /does not count for publishing/)
})

test("the Gmail send-email module builds the message Gmail expects, and refuses cleanly", async () => {
    const code = readFileSync(join(APPS, "gmail", "modules", "send-email", "index.js"), "utf8")
    const check = validatePluginCode(code)
    assert.ok(check.valid, check.error)
    assert.deepEqual(check.packages, ["js-base64"])

    // js-base64 is in the sandbox, not in this repository: stand in for it with
    // Node's own base64, which is what the package does for these two calls.
    const base64 = {
        Base64: {
            encode: (text) => Buffer.from(text, "utf8").toString("base64"),
            encodeURI: (text) => Buffer.from(text, "utf8").toString("base64url"),
        },
    }
    const plugin = loadPluginCode(code, sandboxRequire((name) => {
        if (name === "js-base64") return base64
        throw new Error(`not stubbed: ${name}`)
    }))

    const refused = await simulate(plugin, { config: { to: "", subject: "Hello", body: "Hi" } })
    assert.equal(refused.output?.output, "error")

    let asked
    const sent = await simulate(plugin, {
        config: { to: "ada@example.com, alan@example.com", subject: "Grüße", body: "Hallo", isHtml: false },
        connections: {
            async get(name) {
                assert.equal(name, "account")
                return {
                    id: "test",
                    async request(req) {
                        asked = req
                        return { ok: true, status: 200, body: { id: "m1", threadId: "t1" } }
                    },
                }
            },
        },
    })
    assert.equal(sent.output?.output, "success", JSON.stringify(sent))
    // The step runs in a context of its own, so what it returns is that context's
    // objects; compared as the platform hands them on, as JSON.
    assert.deepEqual(JSON.parse(JSON.stringify(sent.output.data)), { id: "m1", threadId: "t1", to: ["ada@example.com", "alan@example.com"] })
    assert.equal(asked.method, "POST")
    assert.equal(asked.path, "gmail/v1/users/me/messages/send")
    assert.doesNotMatch(asked.body.raw, /[+/=]/, "raw is base64url without padding")

    const message = Buffer.from(asked.body.raw, "base64url").toString("utf8")
    assert.match(message, /^To: ada@example\.com, alan@example\.com\r\n/)
    assert.match(message, /\r\nSubject: =\?UTF-8\?B\?R3LDvMOfZQ==\?=\r\n/)
    assert.match(message, /\r\nContent-Type: text\/plain; charset=UTF-8\r\n/)
    assert.match(message, /\r\n\r\nSGFsbG8=$/)
})

test("`vsa skill --dir` installs exactly the skill in this repository", () => {
    const dir = join(scratch(), "visualautomate-steps")
    const run = vsa(process.cwd(), ["skill", "--dir", dir])
    assert.equal(run.code, 0, run.out)
    assert.deepEqual(filesUnder(dir), filesUnder(SKILL))
    assert.ok(!existsSync(join(dir, "..", "AGENTS.md")), "--dir writes only the skill")
})

test("`vsa skill` in a project installs the skill and writes AGENTS.md and CLAUDE.md, then leaves them be", () => {
    const dir = scratch()
    const first = vsa(dir, ["skill"])
    assert.equal(first.code, 0, first.out)
    assert.ok(existsSync(join(dir, ".claude", "skills", "visualautomate-steps", "SKILL.md")))
    const agents = readFileSync(join(dir, "AGENTS.md"), "utf8")
    assert.match(agents, /The word `import` may not appear anywhere/)
    assert.match(readFileSync(join(dir, "CLAUDE.md"), "utf8"), /^@AGENTS\.md$/m)

    const again = vsa(dir, ["skill"])
    assert.equal(again.code, 0)
    assert.match(again.out, /already this CLI's version/)
    assert.doesNotMatch(again.out, /Wrote AGENTS\.md/)
})

test("`vsa skill` never writes over an AGENTS.md or CLAUDE.md somebody wrote", () => {
    const dir = scratch()
    writeFileSync(join(dir, "AGENTS.md"), "# Our own rules\n")
    writeFileSync(join(dir, "CLAUDE.md"), "Be brief.\n")
    const run = vsa(dir, ["skill"])
    assert.equal(run.code, 0, run.out)
    assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), "# Our own rules\n")
    assert.equal(readFileSync(join(dir, "CLAUDE.md"), "utf8"), "Be brief.\n")
    assert.match(run.out, /AGENTS\.md is your own and was left alone/)
})

test("`vsa skill --global` installs into the home folder's Claude skills", () => {
    const home = scratch()
    const run = vsa(scratch(), ["skill", "--global"], { HOME: home, USERPROFILE: home })
    assert.equal(run.code, 0, run.out)
    assert.ok(existsSync(join(home, ".claude", "skills", "visualautomate-steps", "SKILL.md")))
})

test("`vsa init` writes AGENTS.md and CLAUDE.md, and no longer mentions push", () => {
    const dir = scratch()
    assert.equal(vsa(dir, ["init", "my-step"]).code, 0)
    assert.ok(existsSync(join(dir, "my-step", "AGENTS.md")))
    assert.ok(existsSync(join(dir, "my-step", "CLAUDE.md")))
    assert.doesNotMatch(readFileSync(join(dir, "my-step", "README.md"), "utf8"), /\bpush\b/)
})
