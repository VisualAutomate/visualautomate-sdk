/**
 * What the platform checks about a step's code before it will take it.
 *
 * The same checks, in the same order, with the same messages as the platform's
 * upload, against the rules in ./platform-rules. A plugin that passes here is
 * not refused on push for its code; one that fails here would have been.
 *
 * And a `require` that behaves like the sandbox's: a step gets the allowed
 * packages and nothing else — no `fs`, no `http`, not even `path`.
 */

import { ALLOWED_PACKAGES, RESTRICTED_PATTERNS } from "./platform-rules"

export { ALLOWED_PACKAGES, RESTRICTED_PATTERNS }

/** The names in ALLOWED_PACKAGES, for lookups. */
export const ALLOWED_PACKAGE_NAMES: ReadonlySet<string> = new Set(ALLOWED_PACKAGES.map((p) => p.name))

export type CodeCheck = { valid: true; packages: string[] } | { valid: false; error: string }

/**
 * Check a step's code the way the platform's upload does.
 *
 * On success, also says which packages it requires — the ones a local run has to
 * be able to load.
 */
export function validatePluginCode(code: string): CodeCheck {
    const hasExecute = code.includes("module.exports") || code.includes("exports.execute") || code.includes("export")
    if (!hasExecute) {
        return {
            valid: false,
            error: "Plugin code must export an execute function. Example: module.exports = { execute: async (input, config, context) => { ... } }",
        }
    }

    for (const pattern of RESTRICTED_PATTERNS) {
        if (pattern.test(code)) {
            return {
                valid: false,
                error:
                    "Plugin code contains restricted patterns. Plugins cannot access the filesystem, spawn processes, use eval, import modules, or escape the sandbox."
                    + ` (matched ${pattern})`,
            }
        }
    }

    const packages: string[] = []
    const requireCall = /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g
    let match: RegExpExecArray | null
    while ((match = requireCall.exec(code)) !== null) {
        const name = match[2]
        if (!ALLOWED_PACKAGE_NAMES.has(name)) {
            return {
                valid: false,
                error: `Plugin code requires "${name}" which is not an allowed package. See ALLOWED_PACKAGES for the list.`,
            }
        }
        if (!packages.includes(name)) packages.push(name)
    }

    if (/\brequire\s*\(\s*(?!['"][^'"]+['"]\s*\))/.test(code)) {
        return {
            valid: false,
            error: "Plugin code contains a dynamic require() call. Only require() with string literals of allowed packages is permitted.",
        }
    }

    return { valid: true, packages }
}

/**
 * The `require` a step gets inside the sandbox, backed by a loader of your own.
 *
 * `load` is how this machine finds a package — in the CLI, Node's resolution
 * from the project's directory. The sandbox has every allowed package installed;
 * a laptop has whatever was installed there, so a missing one is reported with
 * the command that installs the version the sandbox has.
 */
export function sandboxRequire(load: (name: string) => unknown): (name: string) => unknown {
    return (name: string) => {
        const allowed = ALLOWED_PACKAGES.find((p) => p.name === name)
        if (!allowed) throw new Error(`Cannot require "${name}"`)
        try {
            return load(name)
        } catch {
            throw new Error(
                `"${name}" is available in the sandbox but not installed here. `
                + `To run this locally: npm install --save-dev ${name}@${allowed.version}`,
            )
        }
    }
}

/**
 * Evaluate a step's code the way the sandbox wraps it: as the body of a function
 * given `module`, `exports` and `require`, in strict mode. Returns what it exported.
 *
 * Not a security boundary — this runs your own code on your own machine. It is
 * here so a file the sandbox cannot load (an `export` statement, a top-level
 * `await`) fails here too, rather than passing a looser loader.
 */
export function loadPluginCode(code: string, require: (name: string) => unknown): unknown {
    const module = { exports: {} as unknown }
    // eslint-disable-next-line no-new-func
    const body = new Function("module", "exports", "require", `"use strict"; ${code}`)
    body(module, module.exports, require)
    return module.exports
}
