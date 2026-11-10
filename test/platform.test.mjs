/**
 * The SDK behaves as the platform does, where the two used to disagree.
 *
 * Each test here is a case that passed on a developer's machine and failed on
 * the platform, or the other way round: a global the runner does not hand a
 * step, a console method it does not have, an export shape it does not accept,
 * a state value too big for the store, a manifest the portal refuses.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import {
    ACCOUNTS_ARE_OURS,
    BLOCKED_GLOBAL_NAMES,
    MAX_CODE_LENGTH,
    PLATFORM_NODE_MAJOR,
    PROVIDED_GLOBALS,
    PUSH_CHECK,
    SANDBOX_OVERRIDES,
    STATE_LIMITS,
    accountUseIn,
    checkManifest,
    executeOf,
    loadPluginCode,
    sandboxRequire,
    simulate,
    validatePluginCode,
} from "../packages/plugin-sdk/dist/index.mjs"

const CLI = fileURLToPath(new URL("../packages/cli/dist/index.js", import.meta.url))
const noRequire = sandboxRequire(() => {
    throw new Error("not installed")
})
const load = (code, options) => loadPluginCode(code, noRequire, options)

function scratch() {
    const dir = mkdtempSync(join(tmpdir(), "va-platform-"))
    test.after(() => rmSync(dir, { recursive: true, force: true }))
    return dir
}

function vsa(cwd, ...args) {
    const env = { ...process.env, NO_COLOR: "1" }
    delete env.FORCE_COLOR
    const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env })
    return { code: run.status, out: `${run.stdout}${run.stderr}` }
}

function write(dir, files) {
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(join(dir, path, ".."), { recursive: true })
        writeFileSync(join(dir, path), typeof text === "string" ? text : JSON.stringify(text, null, 2))
    }
}

// ─── The facts ──────────────────────────────────────────────────────────────

test("the platform's facts are here: Node, globals, overrides, limits, the push check", () => {
    assert.equal(PLATFORM_NODE_MAJOR, 24)
    for (const name of ["fetch", "btoa", "atob", "TextEncoder", "Blob", "FormData", "AbortController", "require"]) {
        assert.ok(PROVIDED_GLOBALS.includes(name), `${name} is handed to a step`)
    }
    for (const name of ["Buffer", "process", "globalThis", "SharedArrayBuffer", "WeakRef", "WebAssembly"]) {
        assert.ok(BLOCKED_GLOBAL_NAMES.includes(name), `${name} is blocked`)
    }
    assert.deepEqual(SANDBOX_OVERRIDES, { exceljs: { uuid: "^11.1.1" } })
    assert.equal(STATE_LIMITS.maxValueBytes, 128 * 1024)
    assert.deepEqual(PUSH_CHECK, { defaultTimeoutMs: 30000, maxTimeoutMs: 60000, defaultExpectOutput: "success", declaredStepsTestedOnPush: false })
})

// ─── The runtime ────────────────────────────────────────────────────────────

test("a step sees the platform's globals and not this process's", () => {
    const seen = load(`module.exports = {
        Buffer: typeof Buffer, process: typeof process, globalThis: typeof globalThis,
        structuredClone: typeof structuredClone, setImmediate: typeof setImmediate,
        fetch: typeof fetch, btoa: typeof btoa, TextEncoder: typeof TextEncoder, Uint8Array: typeof Uint8Array,
        FormData: typeof FormData, URL: typeof URL, crypto: typeof crypto,
        debug: typeof console.debug, log: typeof console.log,
        escape: (function () { try { return typeof Object.constructor("return process")() } catch (e) { return "refused" } })(),
    }`)
    assert.deepEqual({ ...seen }, {
        Buffer: "undefined", process: "undefined", globalThis: "undefined",
        structuredClone: "undefined", setImmediate: "undefined",
        fetch: "function", btoa: "function", TextEncoder: "function", Uint8Array: "function",
        FormData: "function", URL: "function", crypto: "object",
        debug: "undefined", log: "function",
        escape: "undefined",
    })
})

test("a step's console and fetch are the ones it is given", async () => {
    const lines = []
    const asked = []
    const exported = load(
        `console.info("loading"); module.exports = { execute: async () => { console.log("ran", 1); await fetch("https://api.example.com/x"); return { output: "success", data: {} } } }`,
        {
            console: { log: (...a) => lines.push(["log", ...a]), info: (...a) => lines.push(["info", ...a]) },
            fetch: async (url) => {
                asked.push(String(url))
                return new Response("{}")
            },
        },
    )
    await executeOf(exported)()
    assert.deepEqual(lines, [["info", "loading"], ["log", "ran", 1]])
    assert.deepEqual(asked, ["https://api.example.com/x"])
})

test("only the export shapes the runner accepts find an execute", () => {
    const fn = () => {}
    assert.equal(executeOf(fn), fn)
    assert.equal(executeOf({ execute: fn }), fn)
    assert.equal(executeOf({ default: fn }), fn)
    assert.equal(executeOf({ default: { execute: fn } }), null, "a default object with execute is not accepted by the runner")
    assert.equal(executeOf({}), null)
})

test("a last line that is a comment with no newline fails to load, as on the platform", () => {
    assert.throws(() => load("module.exports = { execute() {} } // done"))
    assert.doesNotThrow(() => load("module.exports = { execute() {} } // done\n"))
})

test("code longer than the platform takes is refused", () => {
    const long = `module.exports = { execute() {} }\n// ${"x".repeat(MAX_CODE_LENGTH)}`
    const check = validatePluginCode(long)
    assert.equal(check.valid, false)
    assert.match(check.error, /exceeds maximum length/)
})

// ─── The simulator ──────────────────────────────────────────────────────────

test("state keeps the store's limits and answers list as the platform does", async () => {
    const big = await simulate({ execute: async (i, c, ctx) => (await ctx.state.set("big", "x".repeat(STATE_LIMITS.maxValueBytes)), { output: "success", data: {} }) })
    assert.equal(big.status, "error")
    assert.match(big.error, /at most 128 KB/)

    const short = await simulate({ execute: async (i, c, ctx) => (await ctx.state.set("k", 1, { ttlSeconds: 10 }), { output: "success", data: {} }) })
    assert.match(short.error, /ttlSeconds must be at least 60/)

    const listed = await simulate(
        {
            execute: async (i, c, ctx) => {
                await ctx.state.set("seen/a", 1, { ttlSeconds: 120 })
                return { output: "success", data: await ctx.state.list("seen/") }
            },
        },
        { state: { "seen/b": 2, other: 3 } },
    )
    const { keys, complete } = listed.output.data
    assert.equal(complete, true)
    assert.deepEqual(keys.map((k) => k.key).sort(), ["seen/a", "seen/b"])
    assert.equal(keys.find((k) => k.key === "seen/b").expiresAt, null)
    assert.ok(keys.find((k) => k.key === "seen/a").expiresAt)
})

test("storage has shareUrl, and signedUrl keeps the platform's bounds", async () => {
    const run = await simulate(
        {
            execute: async (i, c, ctx) => ({
                output: "success",
                data: { share: await ctx.storage.shareUrl("a.txt"), signed: await ctx.storage.signedUrl("a.txt", 86400) },
            }),
        },
        { storage: { "a.txt": "hi" } },
    )
    assert.match(run.output.data.share, /share\/a\.txt/)
    assert.match(run.output.data.signed, /expires=3600$/)
})

// ─── The manifest ───────────────────────────────────────────────────────────

test("checkManifest refuses what the portal refuses and warns about what it drops", () => {
    const key = { label: "API key", type: "secret", required: true }
    const good = checkManifest({
        properties: { apiKey: key, channel: { label: "Channel", type: "string" } },
        outputs: ["success", "error"],
        action: {
            baseUrl: "https://slack.com/api",
            request: { method: "POST", path: "chat.postMessage", headers: { Authorization: "Bearer {{config.apiKey}}" }, body: { channel: "{{config.channel}}" } },
            okPath: "ok",
            outputs: { ts: "{{response.ts}}" },
        },
    }, false)
    assert.deepEqual([good.ok, good.kind, good.errors], [true, "declared", []])

    const cases = [
        [{ auth: { type: "oauth2", baseUrl: "https://x" } }, true, /may not name a host/],
        [{ action: { baseUrl: "https://{{input.host}}", request: { path: "y" }, outputs: {} } }, false, /never \{\{input/],
        [{ action: { baseUrl: "https://x", request: { path: "https://evil.example/y" }, outputs: {} } }, false, /relative/],
        [{ action: { baseUrl: "https://x", request: { path: "y" }, outputs: {} } }, true, /both an action block and code/],
        [{}, false, /nothing to run/],
    ]
    for (const [manifest, hasCode, error] of cases) {
        const check = checkManifest(manifest, hasCode)
        assert.equal(check.ok, false, JSON.stringify(manifest))
        assert.match(check.errors.join("\n"), error)
    }

    const warned = checkManifest({
        extra: 1,
        properties: { mode: { label: "Mode", type: "select" } },
        outputs: ["success"],
        timeoutMs: 120000,
    }, true)
    assert.equal(warned.ok, true, warned.errors.join("; "))
    const said = warned.warnings.join("\n")
    for (const words of [/"extra" is not something/, /no options and no optionsFrom/, /cut to 60000/]) assert.match(said, words)
})

test("checkManifest refuses every way a step would act as a connected account", () => {
    // Only VisualAutomate's own apps act as one; the platform refuses a
    // developer's step that does, and the portal will not save or publish it.
    const account = { label: "Account", type: "connection", provider: "github" }
    const cases = [
        [{ properties: { account } }, true, /properties\.account is a connection/],
        [{ properties: { account }, action: { connection: "account", request: { path: "user" }, outputs: { a: "{{response.a}}" } } }, false, /action\.connection makes the call as an account/],
        [{ properties: { pick: { label: "Pick", type: "select", optionsFrom: { connection: "account", request: { path: "x" } } } } }, true, /optionsFrom reads its options as an account/],
        [{ trigger: { connection: "account", request: { path: "messages" }, items: "value", id: "id" } }, false, /trigger watches an account/],
        [{ auth: { type: "oauth2", provider: "github" } }, true, /auth\.provider names "github"/],
    ]
    for (const [manifest, hasCode, error] of cases) {
        const check = checkManifest({ outputs: ["success"], ...manifest }, hasCode)
        assert.equal(check.ok, false, JSON.stringify(manifest))
        const errors = check.errors.join("\n")
        assert.match(errors, error)
        assert.ok(errors.includes(ACCOUNTS_ARE_OURS), "the refusal says what to do instead")
    }
    assert.deepEqual(accountUseIn({ properties: { apiKey: { type: "secret" } } }), [])
})

// ─── The CLI, judging as the push check does ────────────────────────────────

test("vsa test expects success when the test file names no port, as the push check does", () => {
    const dir = scratch()
    write(dir, {
        "manifest.json": { description: "x", properties: {}, outputs: ["success", "error"] },
        "index.js": 'module.exports = { execute: async () => ({ output: "error", data: { error: "no" } }) }\n',
        "visualautomate.test.json": { config: {}, input: {} },
    })
    const run = vsa(dir, "test")
    assert.equal(run.code, 1, run.out)
    assert.match(run.out, /expected success, the default/)
})

test("vsa test gives a step manifest.json's timeout, not the test file's", () => {
    const dir = scratch()
    write(dir, {
        "manifest.json": { description: "x", properties: {}, outputs: ["success"], timeoutMs: 100 },
        "index.js": 'module.exports = { execute: () => new Promise((r) => setTimeout(() => r({ output: "success", data: {} }), 1000)) }\n',
        "visualautomate.test.json": { config: {}, timeoutMs: 5000 },
    })
    const run = vsa(dir, "test")
    assert.equal(run.code, 1, run.out)
    assert.match(run.out, /timeout/)
    assert.match(run.out, /does not read timeoutMs from the test file; it gives this step 100 ms/)
})

test("vsa test runs a step without Buffer, as the platform does", () => {
    const dir = scratch()
    write(dir, {
        "manifest.json": { description: "x", properties: {}, outputs: ["success", "error"] },
        "index.js": 'module.exports = { execute: async () => ({ output: "success", data: { b: Buffer.from("x").toString("base64") } }) }\n',
    })
    const run = vsa(dir, "test")
    assert.equal(run.code, 1, run.out)
    assert.match(run.out, /Cannot read properties of undefined|Buffer/)
})

test("vsa test checks a declared module, and refuses a broken one and one that acts as an account", () => {
    const dir = scratch()
    write(dir, {
        "modules/list-repos/manifest.json": {
            description: "List repositories",
            auth: { type: "none" },
            properties: { token: { label: "GitHub token", type: "secret", required: true } },
            outputs: ["success", "error"],
            action: {
                baseUrl: "https://api.github.com",
                request: { method: "GET", path: "user/repos", headers: { Authorization: "Bearer {{config.token}}" } },
                items: { path: "" },
                outputs: { name: "{{item.full_name}}" },
            },
        },
        "modules/broken/manifest.json": {
            description: "Broken",
            properties: {},
            outputs: ["success"],
            action: { baseUrl: "http://plain.example", request: { path: "x" }, outputs: {} },
        },
        "modules/as-account/manifest.json": {
            description: "As an account",
            auth: { type: "oauth2", provider: "github" },
            properties: { account: { label: "Account", type: "connection", provider: "github" } },
            outputs: ["success", "error"],
            action: { connection: "account", request: { method: "GET", path: "user" }, outputs: { login: "{{response.login}}" } },
        },
    })
    const run = vsa(dir, "test")
    assert.equal(run.code, 1, run.out)
    assert.match(run.out, /✓ checked\s+a declared step: the manifest is sound/)
    assert.match(run.out, /✗ manifest\s+action\.baseUrl must start with https:\/\//)
    assert.match(run.out, /✗ manifest\s+properties\.account is a connection/)
    assert.match(run.out, /1 of 3 passed/)
})
