/**
 * The types the CLI writes into a project, and what an editor does with them.
 *
 * A plugin's code imports nothing — the platform refuses the word `import`
 * anywhere in the file — so an editor can only know what `context` is if the
 * contract is sitting in the project. These tests run the TypeScript compiler
 * over a project laid out the way a repository is, and check that it is.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const CLI = fileURLToPath(new URL("../packages/cli/dist/index.js", import.meta.url))
const TSC = fileURLToPath(new URL("../node_modules/typescript/lib/tsc.js", import.meta.url))
const { version } = JSON.parse(readFileSync(new URL("../packages/cli/package.json", import.meta.url), "utf8"))

function plainEnv() {
    const env = { ...process.env, NO_COLOR: "1" }
    delete env.FORCE_COLOR
    return env
}

function va(cwd, ...args) {
    const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: plainEnv() })
    return { code: run.status, out: `${run.stdout}${run.stderr}` }
}

function scratch() {
    const dir = mkdtempSync(join(tmpdir(), "va-types-"))
    test.after(() => rmSync(dir, { recursive: true, force: true }))
    return dir
}

function write(dir, files) {
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(join(dir, path, ".."), { recursive: true })
        writeFileSync(join(dir, path), typeof text === "string" ? text : JSON.stringify(text))
    }
}

/** An app's repository with one module in it. */
function appRepository(code) {
    const dir = scratch()
    write(dir, {
        "package.json": { name: "app", private: true },
        "modules/send/manifest.json": { name: "send", outputs: ["success"] },
        "modules/send/index.js": code,
    })
    return dir
}

/** What tsc says about the module, as one string. Empty when it is happy. */
function typecheck(dir) {
    try {
        execFileSync(process.execPath, [
            TSC,
            "--noEmit", "--allowJs", "--checkJs", "--target", "ES2022", "--lib", "ES2022",
            // Nothing from this repository's node_modules: a developer's clone
            // has none of it, and types found by accident would prove nothing.
            "--typeRoots", join(dir, "no-types"),
            "visualautomate.d.ts",
            join("modules", "send", "index.js"),
        ], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
        return ""
    } catch (error) {
        return `${error.stdout ?? ""}${error.stderr ?? ""}`
    }
}

const passing = "/** @type {PluginModule} */\n"
    + "module.exports = {\n"
    + "  execute: async (input, config, context) => {\n"
    + "    const runs = await context.state.get(\"runs\")\n"
    + "    await context.storage.put(\"log.txt\", String(runs))\n"
    + "    return { output: \"success\", data: { runs, who: context.userId, name: config.name, from: input.step } }\n"
    + "  },\n"
    + "}\n"

test("a run writes the types, and says nothing the second time", () => {
    const dir = appRepository(passing)

    const first = va(dir, "types")
    assert.equal(first.code, 0, first.out)
    assert.match(first.out, /Wrote visualautomate\.d\.ts and jsconfig\.json/)

    const declarations = readFileSync(join(dir, "visualautomate.d.ts"), "utf8")
    assert.ok(declarations.includes(`CLI ${version}`), "the version is in the file, so an upgrade rewrites it")
    assert.doesNotMatch(declarations, /^\s*export\b/m, "an export would make it a module, and a module is not ambient")
    assert.match(declarations, /declare interface PluginModule\b/)
    assert.match(declarations, /declare interface PluginContext\b/)

    const config = JSON.parse(readFileSync(join(dir, "jsconfig.json"), "utf8"))
    assert.ok(config.include.includes("modules/**/*.js"))
    assert.equal(config.compilerOptions.checkJs, false, "the allowed packages live in the sandbox, not in the project")

    const again = va(dir, "types")
    assert.match(again.out, /already what this CLI writes/)
})

test("testing a module writes them too, so nobody has to know the command", () => {
    const dir = appRepository(passing)
    write(dir, { "modules/send/visualautomate.test.json": { config: {}, input: {} } })
    const run = va(dir, "test")
    assert.equal(run.code, 0, run.out)
    assert.equal(typecheck(dir), "", "the types arrived with the run")
})

test("with them, context is the contract rather than any", () => {
    const dir = appRepository(
        "/** @type {PluginModule} */\n"
        + "module.exports = {\n"
        + "  execute: async (input, config, context) => {\n"
        + "    await context.storage.putt(\"a\", \"b\")\n"
        + "    return { output: \"success\", data: {} }\n"
        + "  },\n"
        + "}\n",
    )
    va(dir, "types")
    assert.match(typecheck(dir), /Property 'putt' does not exist on type 'PluginStorage'/)
})

test("a run inside a module folder writes them at the root, where the editor looks", () => {
    const dir = appRepository(passing)
    va(join(dir, "modules", "send"), "types")
    assert.equal(typecheck(dir), "", "one copy at the top, covering every module")
})

test("a file somebody wrote themselves is never written over", () => {
    const dir = appRepository(passing)
    va(dir, "types")
    write(dir, { "visualautomate.d.ts": "declare interface PluginModule { execute: unknown }\n" })
    write(dir, { "jsconfig.json": JSON.stringify({ compilerOptions: { checkJs: true } }) })

    const again = va(dir, "types")
    assert.equal(again.code, 0, again.out)
    assert.equal(
        readFileSync(join(dir, "visualautomate.d.ts"), "utf8"),
        "declare interface PluginModule { execute: unknown }\n",
        "no marker of ours at the top, so it is theirs",
    )
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "jsconfig.json"), "utf8")), { compilerOptions: { checkJs: true } })
})

test("the annotation the types need is one the platform accepts", async () => {
    const { validatePluginCode } = await import("../packages/plugin-sdk/dist/index.mjs")
    assert.deepEqual(validatePluginCode(passing), { valid: true, packages: [] })
    // Why the annotation names a global instead of importing the SDK.
    const imported = passing.replace(
        "/** @type {PluginModule} */",
        '/** @type {import("@visualautomate/plugin-sdk").PluginModule} */',
    )
    assert.equal(validatePluginCode(imported).valid, false, "a JSDoc import is still an import to the source check")
})
