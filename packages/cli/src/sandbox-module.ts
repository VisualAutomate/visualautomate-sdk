/**
 * Turn esbuild's ES-module bundle into the script the sandbox loads.
 *
 * WHY NOT LET ESBUILD WRITE COMMONJS. An ES module compiled to CommonJS gets
 * esbuild's interop helpers — `__defProp = Object.defineProperty`,
 * `__toCommonJS` — and `Object.defineProperty` is one of the patterns the
 * platform refuses in plugin code, so the upload would turn the bundle away.
 *
 * An ES-module bundle of ES-module sources needs no helpers at all. What it has
 * instead are `import` lines for npm packages and one `export { … }` at the end,
 * and the sandbox understands neither: it runs the code as the body of a
 * function given `module`, `exports` and `require`. Both are rewritten here, and
 * esbuild prints them in a fixed shape, so the rewrite is exact rather than a
 * guess at arbitrary JavaScript.
 *
 * It also drops the `// path/to/file.ts` lines esbuild puts before each source
 * file, so the author's directory layout does not end up in the published code.
 */

/** One `import … from "pkg"` as esbuild prints it, including a multi-line name list. */
const IMPORT = /^import\s+(?:([\w$]+)\s*,\s*)?(?:([\w$]+)|\*\s+as\s+([\w$]+)|\{([\s\S]*?)\})\s+from\s+"([^"]+)";?[ \t]*$/gm
/** `import "pkg";`, for its side effects. */
const BARE_IMPORT = /^import\s+"([^"]+)";?[ \t]*$/gm
/** The export list esbuild ends a module with. */
const EXPORT = /^export\s*\{([\s\S]*?)\};?[ \t]*$/m
/** The comment naming each source file. */
const FILE_MARKER = /^\/\/ (?:\.{1,2}\/|[A-Za-z]:[\\/]|\/)?[^\n]*\.(?:[cm]?[jt]sx?)[ \t]*$\n?/gm

function names(list: string): Array<{ from: string; as: string }> {
    return list
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const [from, as] = part.split(/\s+as\s+/)
            return { from: from.trim(), as: (as ?? from).trim() }
        })
}

export function toSandboxModule(esm: string): string {
    let code = esm.replace(FILE_MARKER, "")

    code = code.replace(IMPORT, (_all, defaultWithOthers, defaultOnly, namespace, list, pkg) => {
        const target = `require(${JSON.stringify(pkg)})`
        const lines: string[] = []
        const main = defaultWithOthers ?? defaultOnly ?? namespace
        if (main) lines.push(`const ${main} = ${target};`)
        if (list !== undefined) {
            const pattern = names(list).map(({ from, as }) => (from === as ? from : `${from}: ${as}`)).join(", ")
            lines.push(`const { ${pattern} } = ${main ?? target};`)
        }
        return lines.join("\n")
    })
    code = code.replace(BARE_IMPORT, (_all, pkg) => `require(${JSON.stringify(pkg)});`)

    const exported = code.match(EXPORT)
    if (exported) {
        const list = names(exported[1])
        const byName = new Map(list.map(({ from, as }) => [as, from]))
        const fallback = byName.get("default")
        let assignment: string
        if (!byName.has("execute") && fallback && list.length === 1) {
            // `export default { execute }` or `export default async function`: the
            // export is the plugin, which is what the sandbox looks for.
            assignment = `module.exports = ${fallback};`
        } else {
            const fields = list.map(({ from, as }) => (from === as ? from : `${as}: ${from}`))
            assignment = `module.exports = { ${fields.join(", ")} };`
            if (!byName.has("execute") && fallback) {
                assignment += `\nif (${fallback} && typeof ${fallback}.execute === "function") module.exports.execute = ${fallback}.execute;`
            }
        }
        code = code.replace(EXPORT, assignment)
    }

    return code.replace(/^\n+/, "")
}
