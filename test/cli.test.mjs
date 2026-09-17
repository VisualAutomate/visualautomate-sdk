/**
 * The CLI, run as a person runs it: the built binary, in a fresh directory.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

import { validatePluginCode } from "../packages/plugin-sdk/dist/index.mjs"

const CLI = fileURLToPath(new URL("../packages/cli/dist/index.js", import.meta.url))

/**
 * The CLI, with colour off.
 *
 * Assertions here are about words, not escape codes, and a terminal that has
 * colour on — npm run sets FORCE_COLOR — would otherwise wrap every one of them.
 * The colour test sets its own environment.
 */
function plainEnv() {
    // Deleted, not emptied: Node warns when both are set, and that warning ends
    // up in the output these tests read.
    const env = { ...process.env, NO_COLOR: "1" }
    delete env.FORCE_COLOR
    return env
}

function va(cwd, ...args) {
    const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: plainEnv() })
    return { code: run.status, out: `${run.stdout}${run.stderr}` }
}

function scratch() {
    const dir = mkdtempSync(join(tmpdir(), "va-cli-"))
    test.after(() => rmSync(dir, { recursive: true, force: true }))
    return dir
}

function write(dir, files) {
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(join(dir, path, ".."), { recursive: true })
        writeFileSync(join(dir, path), typeof text === "string" ? text : JSON.stringify(text))
    }
}

const passing = (greeting) =>
    `module.exports = { execute: async (input, config) => ({ output: "success", data: { text: "${greeting} " + config.name } }) }\n`

test("every template init writes passes the platform's checks and runs", () => {
    const dir = scratch()
    for (const template of ["blank", "http-request", "file"]) {
        assert.equal(va(dir, "init", template, "--template", template).code, 0)
        const run = va(join(dir, template), "test")
        assert.doesNotMatch(run.out, /refused/, `${template}: ${run.out}`)
        if (template !== "http-request") assert.equal(run.code, 0, `${template}: ${run.out}`)
    }
    // Needs somebody's connected account, which is not simulated — but its code is fine.
    va(dir, "init", "connection", "--template", "connection")
    assert.doesNotMatch(va(join(dir, "connection"), "test").out, /refused/)
})

test("a TypeScript plugin bundles to code the platform accepts", async () => {
    const dir = scratch()
    write(dir, {
        "helper.ts": "export const shout = (s: string) => s.toUpperCase()\n",
        "plugin.ts":
            'import { shout } from "./helper"\n'
            + 'export default { async execute(input: unknown, config: { name: string }) { return { output: "success", data: { text: shout(config.name) } } } }\n',
        "plugin.json": { name: "ts", version: "1.0.0" },
        "manifest.json": { name: "ts", outputs: ["success"] },
        "test.json": { config: { name: "brent" }, input: {}, expectOutput: "success" },
    })
    const run = va(dir, "test")
    assert.equal(run.code, 0, run.out)
    assert.match(run.out, /"text": "BRENT"/)
})

test("a plugin's GitHub repository is tested the way the push check tests it", () => {
    const dir = scratch()
    write(dir, {
        "manifest.json": { name: "hello", outputs: ["success", "error"] },
        "index.js": passing("Hello"),
        "visualautomate.test.json": { config: { name: "Brent" }, input: {}, expectOutput: "success" },
    })
    const run = va(dir, "test")
    assert.equal(run.code, 0, run.out)
    assert.match(run.out, /✓ passed/)
    assert.match(run.out, /"text": "Hello Brent"/)

    write(dir, { "visualautomate.test.json": { config: { name: "Brent" }, input: {}, expectOutput: "error" } })
    const wrongPort = va(dir, "test")
    assert.equal(wrongPort.code, 1)
    assert.match(wrongPort.out, /expected error/)
})

test("an app's repository runs every module, or the one asked for", () => {
    const dir = scratch()
    write(dir, {
        "modules/send/manifest.json": { name: "send", outputs: ["success"] },
        "modules/send/index.js": passing("Sent"),
        "modules/send/visualautomate.test.json": { config: { name: "a" }, input: {} },
        "modules/read/manifest.json": { name: "read", outputs: ["success"] },
        "modules/read/index.js": 'const fs = require("fs")\n' + passing("Read"),
    })

    const all = va(dir, "test")
    assert.equal(all.code, 1)
    assert.match(all.out, /▸ modules\/read[\s\S]*requires "fs"/)
    assert.match(all.out, /▸ modules\/send[\s\S]*✓ passed/)
    assert.match(all.out, /1 of 2 passed/)

    const one = va(dir, "test", "--module", "send")
    assert.equal(one.code, 0, one.out)
    assert.doesNotMatch(one.out, /modules\/read/)

    assert.match(va(dir, "test", "--module", "nope").out, /No module matches "nope"/)
})

test("an allowed package that is not installed says how to install it", () => {
    const dir = scratch()
    write(dir, {
        "manifest.json": { name: "p", outputs: ["success"] },
        "index.js": 'const R = require("ramda")\n' + passing("x"),
    })
    const run = va(dir, "test")
    assert.equal(run.code, 1)
    assert.match(run.out, /npm install --save-dev ramda@/)
})

test("a malformed test file stops the run instead of running with nothing", () => {
    const dir = scratch()
    write(dir, {
        "manifest.json": { name: "p", outputs: ["success"] },
        "index.js": passing("x"),
        "visualautomate.test.json": "{ not json",
    })
    const run = va(dir, "test")
    assert.equal(run.code, 1)
    assert.match(run.out, /is not valid JSON/)
})

test("the ES-module rewrite leaves nothing the platform refuses", async () => {
    const { toSandboxModule } = await import(
        "data:text/javascript," + encodeURIComponent(
            (await build({ entryPoints: [fileURLToPath(new URL("../packages/cli/src/sandbox-module.ts", import.meta.url))], write: false, format: "esm", bundle: true, platform: "node" })).outputFiles[0].text,
        )
    )
    const esm = [
        "// ../../Users/someone/secret-project/plugin.ts",
        'import get from "lodash/get";',
        'import { merge as m, set } from "lodash";',
        'import * as R from "ramda";',
        'import dayjs, { extend } from "dayjs";',
        'import "dayjs/locale/nl";',
        "async function execute() { return { output: \"success\", data: { g: typeof get, m: typeof m, s: typeof set, R: typeof R, d: typeof dayjs, e: typeof extend } }; }",
        "var plugin_default = { execute };",
        "export {",
        "  plugin_default as default,",
        "  execute",
        "};",
    ].join("\n")
    const code = toSandboxModule(esm)

    assert.doesNotMatch(code, /secret-project/, "the author's path went into the published code")
    assert.doesNotMatch(code, /^\s*(import|export)\b/m)
    assert.match(code, /const get = require\("lodash\/get"\);/)
    assert.match(code, /const \{ merge: m, set \} = require\("lodash"\);/)
    assert.match(code, /const dayjs = require\("dayjs"\);\nconst \{ extend \} = dayjs;/)
    assert.match(code, /require\("dayjs\/locale\/nl"\);/)
    assert.match(code, /module\.exports = \{ default: plugin_default, execute \};/)

    // A subpath is not a package name, on the platform or here.
    const check = validatePluginCode(code)
    assert.equal(check.valid, false, "lodash/get is not on the list, so this must be refused")
    assert.match(check.error, /lodash\/get/)
    const withoutSubpaths = code.replace('"lodash/get"', '"lodash"').replace('require("dayjs/locale/nl");', "")
    assert.deepEqual(validatePluginCode(withoutSubpaths), { valid: true, packages: ["lodash", "ramda", "dayjs"] })

    assert.equal(
        toSandboxModule("var plugin_default = { execute() {} };\nexport {\n  plugin_default as default\n};\n").trim(),
        "var plugin_default = { execute() {} };\nmodule.exports = plugin_default;",
    )
})

test("a module is named as the first argument, and a short name is enough", async () => {
    const dir = scratch()
    write(dir, {
        "modules/send-message/manifest.json": { name: "send", outputs: ["success"] },
        "modules/send-message/index.js": passing("Sent"),
        "modules/list-channels/manifest.json": { name: "list", outputs: ["success"] },
        "modules/list-channels/index.js": passing("Listed"),
    })

    const one = va(dir, "test", "send")
    assert.equal(one.code, 0, one.out)
    assert.match(one.out, /Sent/)
    assert.doesNotMatch(one.out, /Listed/, "only the module that was named ran")

    // The old spelling still works, and so does a name from the middle.
    assert.match(va(dir, "test", "--module", "send-message").out, /Sent/)
    assert.match(va(dir, "test", "chan").out, /Listed/)

    const missing = va(dir, "test", "nope")
    assert.equal(missing.code, 1)
    assert.match(missing.out, /No module matches "nope"[\s\S]*list-channels, send-message/)

    const { matchFolders } = await import(
        "data:text/javascript," + encodeURIComponent(
            (await build({
                entryPoints: [fileURLToPath(new URL("../packages/cli/src/project.ts", import.meta.url))],
                write: false, format: "esm", bundle: true, platform: "node",
            })).outputFiles[0].text,
        )
    )
    assert.deepEqual(matchFolders(["send-message", "send-file"], "send-message"), ["send-message"], "exact wins")
    assert.deepEqual(matchFolders(["send-message", "send-file"], "send"), ["send-message", "send-file"], "both, and the error lists them")
    assert.deepEqual(matchFolders(["send-message"], "MESSAGE"), ["send-message"], "case does not matter")
})

test("add:property writes a field into the manifest and leaves the rest of the file alone", () => {
    const dir = scratch()
    // A manifest as an author has it: one property, and the commented-out
    // examples the scaffold writes underneath.
    writeFileSync(join(dir, "manifest.json"), `{
  "properties": {
    "message": { "label": "Message", "type": "string" }
  },
  "outputs": ["success"]
  // "properties" here is an example, not a member:
  //   "retries": { "label": "Retries", "type": "number" }
}
`)
    writeFileSync(join(dir, "index.js"), passing("Hi"))
    writeFileSync(join(dir, "visualautomate.test.json"), `{
  "config": {},
  "input": {}
}
`)

    assert.equal(va(dir, "add:property", "string", "apiKey", "The key to call with").code, 0)
    assert.equal(va(dir, "add:property", "number", "retries", "How many times", "2", "--required").code, 0)
    assert.equal(va(dir, "add:prop", "select", "mode", "Which way", "fast", "--options", "Fast:fast,Thorough:thorough").code, 0)

    const text = readFileSync(join(dir, "manifest.json"), "utf8")
    assert.match(text, /\/\/ {3}"retries": \{ "label": "Retries"/, "the comments are still there")
    assert.match(text, /\{ "label": "Fast", "value": "fast" \}/, "a choice is one line")

    const manifest = JSON.parse(text.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n"))
    assert.deepEqual(manifest.properties.apiKey, {
        label: "Api key",
        type: "string",
        description: "The key to call with",
    })
    assert.equal(manifest.properties.retries.default, 2, "a number, not the string")
    assert.equal(manifest.properties.retries.required, true)
    assert.deepEqual(manifest.properties.mode.options[1], { label: "Thorough", value: "thorough" })
    assert.deepEqual(manifest.outputs, ["success"], "what was already there is untouched")

    // And into the run's config, so the next `vsa test` passes something for it.
    const run = JSON.parse(readFileSync(join(dir, "visualautomate.test.json"), "utf8"))
    assert.deepEqual(run.config, { apiKey: "", retries: 2, mode: "fast" }, "the default, or the shape of the type")
})

test("add:property gives the test file a value of the right shape, and keeps one that is already there", () => {
    const dir = scratch()
    writeFileSync(join(dir, "manifest.json"), '{ "outputs": ["success"] }\n')
    writeFileSync(join(dir, "index.js"), passing("Hi"))

    // No test file yet: one is written, config first, because that is the part
    // being filled in.
    assert.equal(va(dir, "add:property", "number", "retries", "How many", "3").code, 0)
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "visualautomate.test.json"), "utf8")), {
        config: { retries: 3 },
        input: {},
    })

    // A config the author keeps on one line keeps its value and its one line.
    rmSync(join(dir, "visualautomate.test.json"))
    writeFileSync(join(dir, "test.json"), '{\n  "config": { "retries": 9 },\n  "input": {}\n}\n')
    assert.equal(va(dir, "add:property", "boolean", "dryRun", "Say what it would do").code, 0)
    assert.match(
        readFileSync(join(dir, "test.json"), "utf8"),
        /"config": \{ "retries": 9, "dryRun": false \}/,
        "one line in, one line out",
    )

    // What the author put there is never written over.
    assert.equal(va(dir, "add:property", "number", "another", "How many again", "1").code, 0)
    assert.equal(JSON.parse(readFileSync(join(dir, "test.json"), "utf8")).config.retries, 9)
})

test("add:property says what is wrong instead of writing something broken", () => {
    const dir = scratch()
    writeFileSync(join(dir, "manifest.json"), '{\n  "properties": { "message": { "label": "Message", "type": "string" } }\n}\n')
    writeFileSync(join(dir, "index.js"), passing("Hi"))
    const before = readFileSync(join(dir, "manifest.json"), "utf8")

    for (const [args, expected] of [
        [["add:property", "strng", "x"], /no "strng" property/],
        [["add:property", "number", "n", "how many", "abc"], /not a number/],
        [["add:property", "select", "s", "which"], /needs its choices/],
        [["add:property", "connection", "c", "whose"], /needs the provider/],
        [["add:property", "string", "api-key"], /not a name your code can read/],
        [["add:property", "string", "message"], /already has a property called message/],
        [["add:property"], /What property\?/],
    ]) {
        const run = va(dir, ...args)
        assert.equal(run.code, 1, `${args.join(" ")}: ${run.out}`)
        assert.match(run.out, expected)
    }
    assert.equal(readFileSync(join(dir, "manifest.json"), "utf8"), before, "nothing was written")
})

test("add:property adds the properties block to a manifest that has none", () => {
    const dir = scratch()
    writeFileSync(join(dir, "manifest.json"), '{\n  "outputs": ["success"]\n  //   "properties": { "mode": {} }\n}\n')
    writeFileSync(join(dir, "index.js"), passing("Hi"))

    assert.equal(va(dir, "add:property", "boolean", "dryRun", "Say what it would do", "false").code, 0)
    const text = readFileSync(join(dir, "manifest.json"), "utf8")
    assert.match(text, /\/\/ {3}"properties": \{ "mode": \{\} \}/, "the example in the comment is not the one that was edited")
    const manifest = JSON.parse(text.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n"))
    assert.equal(manifest.properties.dryRun.default, false)
    assert.deepEqual(manifest.outputs, ["success"])
})

test("add:property names the modules when a repository has more than one", () => {
    const dir = scratch()
    write(dir, {
        "modules/send-message/manifest.json": { name: "send", outputs: ["success"] },
        "modules/send-message/index.js": passing("Sent"),
        "modules/list-channels/manifest.json": { name: "list", outputs: ["success"] },
        "modules/list-channels/index.js": passing("Listed"),
    })

    const ambiguous = va(dir, "add:property", "string", "apiKey")
    assert.equal(ambiguous.code, 1)
    assert.match(ambiguous.out, /Which module\?[\s\S]*list-channels, send-message/)

    assert.equal(va(dir, "add:property", "string", "apiKey", "The key", "--module", "send").code, 0)
    const sent = JSON.parse(readFileSync(join(dir, "modules/send-message/manifest.json"), "utf8"))
    assert.equal(sent.properties.apiKey.label, "Api key")
    const listed = JSON.parse(readFileSync(join(dir, "modules/list-channels/manifest.json"), "utf8"))
    assert.equal(listed.properties, undefined, "only the module that was named")
})
