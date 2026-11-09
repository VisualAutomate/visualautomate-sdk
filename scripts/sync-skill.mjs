/**
 * Fill the generated parts of the AI skill from the SDK's own rules.
 *
 * skills/visualautomate-steps/references/sandbox.md lists the npm packages a
 * step may require, the patterns the platform refuses and the globals that are
 * not there. Those lists live in packages/plugin-sdk/src/platform-rules.ts and
 * context-api.ts, and a skill that taught an older list would have an assistant
 * write code the platform refuses. So the lists are written into the markdown
 * from the built SDK, between marker comments, and test/skill.test.mjs fails
 * when they differ.
 *
 *     npm run build && node scripts/sync-skill.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { ALLOWED_PACKAGES, BLOCKED_GLOBALS, RESTRICTED_PATTERNS } from "../packages/plugin-sdk/dist/index.mjs"

export const SANDBOX_MD = fileURLToPath(new URL("../skills/visualautomate-steps/references/sandbox.md", import.meta.url))

/** What belongs between each pair of markers. */
export function generatedBlocks() {
    return {
        globals: [
            "| Name | Instead |",
            "| --- | --- |",
            ...BLOCKED_GLOBALS.map((g) => `| \`${g.name}\` | ${g.instead} |`),
        ].join("\n"),
        packages: ALLOWED_PACKAGES.map((p) => `\`${p.name}\``).join(", "),
        patterns: ["```text", ...RESTRICTED_PATTERNS.map((r) => r.source), "```"].join("\n"),
    }
}

/** The markdown with every marked block replaced by what it should hold. */
export function filled(markdown) {
    let out = markdown
    for (const [name, body] of Object.entries(generatedBlocks())) {
        const start = `<!-- ${name}:start -->`
        const end = `<!-- ${name}:end -->`
        const from = out.indexOf(start)
        const to = out.indexOf(end)
        if (from < 0 || to < from) throw new Error(`sandbox.md has no ${start} … ${end} block`)
        out = `${out.slice(0, from + start.length)}\n${body}\n${out.slice(to)}`
    }
    return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const before = readFileSync(SANDBOX_MD, "utf8")
    const after = filled(before)
    if (after !== before) {
        writeFileSync(SANDBOX_MD, after)
        console.log("sandbox.md updated from the SDK's rules")
    } else {
        console.log("sandbox.md already matches the SDK's rules")
    }
}
