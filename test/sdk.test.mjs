/**
 * The SDK as a published package: what `import "@visualautomate/plugin-sdk"` gets.
 *
 * Run against dist/, after `npm run build`, so the thing tested is the thing
 * that ships.
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
    ALLOWED_PACKAGES,
    ALLOWED_PACKAGE_NAMES,
    RESTRICTED_PATTERNS,
    loadPluginCode,
    sandboxRequire,
    simulate,
    validatePluginCode,
} from "../packages/plugin-sdk/dist/index.mjs"

test("the platform's rules came across", () => {
    assert.ok(ALLOWED_PACKAGES.length > 100, "the package list is suspiciously short")
    assert.ok(ALLOWED_PACKAGE_NAMES.has("nodemailer"))
    assert.ok(ALLOWED_PACKAGE_NAMES.has("lodash"))
    assert.ok(!ALLOWED_PACKAGE_NAMES.has("fs"))
    assert.ok(!ALLOWED_PACKAGE_NAMES.has("axios"), "an HTTP client would bypass the egress guard")
    assert.ok(RESTRICTED_PATTERNS.every((p) => p instanceof RegExp))
})

test("code the platform accepts is accepted, and says what it requires", () => {
    const check = validatePluginCode(
        'const _ = require("lodash")\nmodule.exports = { execute: async () => ({ output: "success", data: { n: _.sum([1, 2]) } }) }',
    )
    assert.deepEqual(check, { valid: true, packages: ["lodash"] })
})

test("code the platform refuses is refused, for the same reason", () => {
    const cases = [
        ["const x = 1", /must export an execute function/],
        ['module.exports = { execute: () => eval("1") }', /restricted patterns/],
        ['const fs = require("fs")\nmodule.exports = { execute() {} }', /requires "fs" which is not an allowed package/],
        ['const name = "lodash"\nconst _ = require(name)\nmodule.exports = { execute() {} }', /dynamic require/],
        ['import _ from "lodash"\nexport default { execute() {} }', /restricted patterns/],
        ["module.exports = { execute: () => Object.defineProperty({}, 'a', {}) }", /restricted patterns/],
    ]
    for (const [code, message] of cases) {
        const check = validatePluginCode(code)
        assert.equal(check.valid, false, code)
        assert.match(check.error, message, code)
    }
})

test("the sandbox's require gives allowed packages and nothing else", () => {
    const loaded = []
    const req = sandboxRequire((name) => {
        loaded.push(name)
        if (name === "lodash") return { sum: (xs) => xs.reduce((a, b) => a + b, 0) }
        throw new Error("not installed")
    })
    assert.equal(req("lodash").sum([1, 2, 3]), 6)
    assert.throws(() => req("fs"), /Cannot require "fs"/)
    assert.throws(() => req("ramda"), /npm install --save-dev ramda@/)
    assert.deepEqual(loaded, ["lodash", "ramda"], "a disallowed name was looked up at all")
})

test("plugin code is loaded as the sandbox wraps it", () => {
    const exported = loadPluginCode('module.exports = { execute: async () => ({ output: "success" }) }', () => null)
    assert.equal(typeof exported.execute, "function")
    assert.throws(() => loadPluginCode("export default {}", () => null), SyntaxError)
})

test("simulate runs a plugin with storage and state that behave", async () => {
    const result = await simulate(
        {
            async execute(input, config, context) {
                const text = new TextDecoder().decode(await context.storage.get("in.txt"))
                await context.storage.put("out.txt", text.toUpperCase())
                await context.state.set("runs", ((await context.state.get("runs")) ?? 0) + 1)
                return { output: "success", data: { length: text.length, who: config.who } }
            },
        },
        { config: { who: "me" }, storage: { "in.txt": "hello" }, state: { runs: 2 } },
    )
    assert.equal(result.status, "success")
    assert.deepEqual(result.output.data, { length: 5, who: "me" })
    assert.equal(new TextDecoder().decode(result.files.get("out.txt").bytes), "HELLO")
    assert.equal(result.state.get("runs"), 3)
})

test("simulate says what a broken plugin did wrong", async () => {
    const noOutput = await simulate({ execute: async () => ({ data: {} }) })
    assert.equal(noOutput.status, "error")
    assert.match(noOutput.error, /has no `output`/)

    const slow = await simulate({ execute: () => new Promise(() => {}) }, { timeoutMs: 20 })
    assert.equal(slow.status, "timeout")

    const connection = await simulate({ execute: async (i, c, context) => context.connections.get("gmail") })
    assert.equal(connection.status, "error")
    assert.match(connection.error, /not available locally/)
})
