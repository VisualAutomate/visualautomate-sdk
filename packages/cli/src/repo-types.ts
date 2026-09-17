/**
 * The contract, written into the project so an editor knows what `context` is.
 *
 * A plugin's `index.js` is plain JavaScript the sandbox loads, and it cannot
 * import anything to find out: the platform refuses the word `import` anywhere
 * in the file — comments included, so a JSDoc `import("@visualautomate/plugin-sdk")`
 * is refused too — and the SDK is not one of the packages a step may require.
 * Installing it changes nothing. So the types arrive as ambient declarations
 * beside the code, with a `jsconfig.json` that includes them, and one line above
 * the assignment names the type:
 *
 *     @type {PluginModule}
 *
 * in a JSDoc comment. From there an editor completes `input`, `config` and
 * `context`, with the documentation on every helper, in a project with nothing
 * installed.
 *
 * The declarations are generated from the SDK's own source at build time, so
 * they cannot drift from the contract the platform keeps. `jsconfig.json` is
 * written once and then left alone — it is a project's own file — while the
 * declarations are ours: they are rewritten whenever this CLI has a different
 * version of them, and left alone if somebody has replaced the header with
 * something of their own.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"

import { AMBIENT_DECLARATIONS } from "./ambient-declarations"

export const TYPES_FILE = "visualautomate.d.ts"
export const JSCONFIG_FILE = "jsconfig.json"

/** The first line of every copy we have ever written. How ours is recognised. */
export const TYPES_MARKER = "// The VisualAutomate plugin contract, for your editor."

export function declarationsFor(version: string): string {
    return `${TYPES_MARKER}
//
// Written by the VisualAutomate CLI ${version}. Nothing here exists while your
// plugin runs, and your code imports none of it: the line "@type {PluginModule}"
// above module.exports is what connects the two.
//
// Edits to this file are overwritten. Delete it and it is written again.

${AMBIENT_DECLARATIONS}`
}

const JSCONFIG = `${JSON.stringify(
    {
        compilerOptions: {
            target: "ES2022",
            lib: ["ES2022"],
            module: "node16",
            moduleResolution: "node16",
            allowJs: true,
            // Off on purpose: a plugin may require any of the packages the
            // sandbox has, which are installed there and not here, and checking
            // would report every one of them as a module that cannot be found.
            // Completion and hover documentation do not need it.
            checkJs: false,
            noEmit: true,
        },
        include: [TYPES_FILE, "*.js", "modules/**/*.js", "examples/**/*.js"],
        exclude: ["node_modules", ".visualautomate"],
    },
    null,
    2,
)}\n`

/**
 * Put both files in `root` where they are wanted, and say what was written.
 *
 * Silent about what was already right, so a `dev` that has nothing to do says
 * nothing about types.
 */
export function ensureRepoTypes(root: string, version: string): string[] {
    const written: string[] = []

    const typesPath = join(root, TYPES_FILE)
    const wanted = declarationsFor(version)
    const current = existsSync(typesPath) ? read(typesPath) : null
    // Absent, or ours and out of date. A file that does not start with our
    // marker is somebody else's and is never touched.
    if (current === null || (current.startsWith(TYPES_MARKER) && current !== wanted)) {
        writeFileSync(typesPath, wanted)
        written.push(TYPES_FILE)
    }

    const jsconfigPath = join(root, JSCONFIG_FILE)
    if (!existsSync(jsconfigPath)) {
        writeFileSync(jsconfigPath, JSCONFIG)
        written.push(JSCONFIG_FILE)
    }

    return written
}

function read(path: string): string | null {
    try {
        return readFileSync(path, "utf8")
    } catch {
        return null
    }
}

/**
 * Where the types belong for a run started in `cwd`.
 *
 * Inside modules/<name> that is the repository root: one copy at the top covers
 * every module, which is how the repository is opened in an editor.
 */
export function projectRoot(cwd: string): string {
    const parent = dirname(cwd)
    if (basename(parent) === "modules") {
        const root = dirname(parent)
        if (existsSync(join(root, "package.json")) || existsSync(join(root, TYPES_FILE))) return root
    }
    return cwd
}
