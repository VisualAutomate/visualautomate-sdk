/**
 * The SDK as somebody else installs it: packed, installed into an empty
 * project, then loaded with `require` and with `import`.
 *
 * Importing dist/ from inside this repository cannot catch a package that
 * resolves wrongly — the file is found by path, not through `exports` — and
 * that is how a `require` that could not work was published.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * npm's own script, run with this Node. Not `npm.cmd` through a shell: on
 * Windows that splits every path with a space in it.
 */
const NPM_CLI = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
].find((path) => path && path.endsWith(".js") && existsSync(path))

const npm = (args, cwd) => execFileSync(process.execPath, [NPM_CLI, ...args], { cwd, encoding: "utf8" })

test("the packed SDK loads with require and with import, and exposes package.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "va-pack-"))
    test.after(() => rmSync(dir, { recursive: true, force: true }))

    const sdk = fileURLToPath(new URL("../packages/plugin-sdk", import.meta.url))
    npm(["pack", sdk, "--pack-destination", dir, "--ignore-scripts"], dir)
    const tarball = readdirSync(dir).find((f) => f.endsWith(".tgz"))
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true }))
    npm(["install", `./${tarball}`, "--no-audit", "--no-fund", "--ignore-scripts"], dir)

    const cjs = execFileSync(
        process.execPath,
        ["-e", 'const s = require("@visualautomate/plugin-sdk"); console.log(typeof s.simulate, s.ALLOWED_PACKAGES.length > 0, require("@visualautomate/plugin-sdk/package.json").name)'],
        { cwd: dir, encoding: "utf8" },
    )
    assert.equal(cjs.trim(), "function true @visualautomate/plugin-sdk")

    const esm = execFileSync(
        process.execPath,
        ["--input-type=module", "-e", 'import { simulate, validatePluginCode } from "@visualautomate/plugin-sdk"; console.log(typeof simulate, validatePluginCode("module.exports={execute(){}}").valid)'],
        { cwd: dir, encoding: "utf8" },
    )
    assert.equal(esm.trim(), "function true")
})
