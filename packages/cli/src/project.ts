/**
 * What there is to test in a directory.
 *
 * Three shapes, because plugins are made three ways:
 *
 *   A plugin made with `init`       plugin.ts (or .js), manifest.json, plugin.json, test.json
 *   A plugin's GitHub repository    manifest.json, index.js, visualautomate.test.json at the root
 *   An app's GitHub repository      modules/<slug>/ with those three files in each folder
 *
 * The repository shapes are the ones the platform tests on every push, so they
 * are run the way the platform runs them: index.js as it is, unbundled, because
 * that file is what the sandbox loads. A plugin made with `init` is bundled
 * first, because `push` sends the bundle.
 */

import { existsSync, readdirSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { basename, join, relative, resolve } from "node:path"

export const TEST_FILES = ["visualautomate.test.json", "test.json"]
const ENTRIES = ["plugin.ts", "plugin.js", "index.ts", "index.js"]

export interface Target {
    /** How it is named in the output: the module folder, or the directory. */
    name: string
    dir: string
    entry: string
    /** Loaded as written, the way the platform loads a repository's index.js. */
    raw: boolean
}

function entryIn(dir: string): string | null {
    return ENTRIES.map((file) => join(dir, file)).find((file) => existsSync(file)) ?? null
}

/**
 * Everything testable from `cwd`.
 *
 * At the root of an app's repository that is every module folder, or the one
 * named by `--module`. Inside a module folder, or in a plugin's directory, it is
 * that one.
 */
export function findTargets(cwd: string, only?: string): Target[] {
    const dir = resolve(cwd)
    const modulesDir = join(dir, "modules")

    if (!entryIn(dir) && existsSync(modulesDir) && statSync(modulesDir).isDirectory()) {
        const folders = readdirSync(modulesDir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && existsSync(join(modulesDir, d.name, "manifest.json")))
            .map((d) => d.name)
            .sort()
        if (folders.length === 0) {
            throw new Error("There is a modules/ folder here, but none of its folders has a manifest.json.")
        }
        const chosen = only ? folders.filter((f) => f === only) : folders
        if (only && chosen.length === 0) {
            throw new Error(`No module "${only}" in modules/. There is: ${folders.join(", ")}.`)
        }
        return chosen.map((folder) => targetIn(join(modulesDir, folder), `modules/${folder}`)).filter(Boolean) as Target[]
    }

    const target = targetIn(dir, basename(dir))
    if (!target) {
        throw new Error(
            "Nothing to test here: no plugin.ts, plugin.js or index.js, and no modules/ folder.\n"
            + "Run this in a plugin's folder, at the root of its repository, or run `visualautomate init <name>`.",
        )
    }
    return [target]
}

function targetIn(dir: string, name: string): Target | null {
    const entry = entryIn(dir)
    if (!entry) return null
    const raw = basename(entry) === "index.js" && !existsSync(join(dir, "plugin.json"))
    return { name, dir, entry, raw }
}

/** Which target a changed file belongs to, for `dev`; null when it could be any of them. */
export function targetForPath(targets: Target[], changed: string): Target | null {
    // The folder itself counts: Windows reports `modules/send` beside the file in it.
    const hit = targets.find((t) => {
        const rel = relative(t.dir, changed)
        return !rel.startsWith("..") && !rel.startsWith("/") && !/^[a-zA-Z]:/.test(rel)
    })
    return targets.length > 1 ? hit ?? null : targets[0] ?? null
}

// ─── The test file ──────────────────────────────────────────────────────────

export interface TestFile {
    path: string | null
    config: Record<string, unknown>
    input: Record<string, unknown>
    storage?: Record<string, string>
    state?: Record<string, unknown>
    secrets?: Record<string, string>
    timeoutMs?: number
    /** The port the run must leave by to pass. Absent: any successful run passes. */
    expectOutput?: string
    /** The hosts `fetch` may reach, `["*"]` for any. Absent: nothing is blocked, only reported. */
    allowedDomains?: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/**
 * The run's settings, from `--input`, visualautomate.test.json or test.json.
 *
 * A malformed file is an error rather than an empty run, as it is on the
 * platform: running with no config is not the test somebody wrote.
 */
export async function readTestFile(dir: string, override?: string): Promise<TestFile> {
    const path = override ? resolve(override) : TEST_FILES.map((f) => join(dir, f)).find((f) => existsSync(f)) ?? null
    if (!path) return { path: null, config: {}, input: {} }
    if (!existsSync(path)) throw new Error(`${path} does not exist.`)

    let raw: unknown
    try {
        raw = JSON.parse(await readFile(path, "utf8"))
    } catch (error) {
        throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!isPlainObject(raw)) throw new Error(`${path} must be an object with "config" and "input".`)

    for (const key of ["config", "input", "storage", "state", "secrets"] as const) {
        if (raw[key] !== undefined && !isPlainObject(raw[key])) {
            throw new Error(`${path}: "${key}" must be an object.`)
        }
    }
    if (raw.expectOutput !== undefined && (typeof raw.expectOutput !== "string" || raw.expectOutput === "")) {
        throw new Error(`${path}: "expectOutput" must be the name of an output port, like "success".`)
    }
    if (raw.timeoutMs !== undefined && (typeof raw.timeoutMs !== "number" || raw.timeoutMs <= 0 || raw.timeoutMs > 60_000)) {
        throw new Error(`${path}: "timeoutMs" must be a number of milliseconds up to 60000.`)
    }

    if (
        raw.allowedDomains !== undefined
        && (!Array.isArray(raw.allowedDomains) || !raw.allowedDomains.every((d) => typeof d === "string" && d.trim() !== ""))
    ) {
        throw new Error(`${path}: "allowedDomains" must be a list of hosts, like ["api.example.com"], or ["*"].`)
    }

    return {
        path,
        allowedDomains: raw.allowedDomains as string[] | undefined,
        config: (raw.config as Record<string, unknown>) ?? {},
        input: (raw.input as Record<string, unknown>) ?? {},
        storage: raw.storage as Record<string, string> | undefined,
        state: raw.state as Record<string, unknown> | undefined,
        secrets: raw.secrets as Record<string, string> | undefined,
        timeoutMs: raw.timeoutMs as number | undefined,
        expectOutput: raw.expectOutput as string | undefined,
    }
}
