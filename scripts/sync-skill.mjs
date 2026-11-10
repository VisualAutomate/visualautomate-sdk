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

import {
    ALLOWED_PACKAGES,
    BLOCKED_GLOBAL_NAMES,
    BLOCKED_GLOBALS,
    PLATFORM_NODE_MAJOR,
    PROVIDED_GLOBALS,
    RESTRICTED_PATTERNS,
    SANDBOX_TIERS,
} from "../packages/plugin-sdk/dist/index.mjs"

export const SANDBOX_MD = fileURLToPath(new URL("../skills/visualautomate-steps/references/sandbox.md", import.meta.url))

/** What belongs between each pair of markers. */
export function generatedBlocks() {
    return {
        node: `**Node.js ${PLATFORM_NODE_MAJOR}**`,
        provided: PROVIDED_GLOBALS.filter((name) => name !== "require").map((name) => `\`${name}\``).join(", "),
        blocked: BLOCKED_GLOBAL_NAMES.map((name) => `\`${name}\``).join(", "),
        tiers: SANDBOX_TIERS.map((t) => `\`${t.id}\` ${t.vcpus} vCPU and ${t.memoryGb} GB`).join(", "),
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
    // Keep the file's own line endings, so a checkout with CRLF compares equal.
    const eol = markdown.includes("\r\n") ? "\r\n" : "\n"
    let out = markdown
    for (const [name, lines] of Object.entries(generatedBlocks())) {
        const body = lines.split("\n").join(eol)
        const start = `<!-- ${name}:start -->`
        const end = `<!-- ${name}:end -->`
        const from = out.indexOf(start)
        const to = out.indexOf(end)
        if (from < 0 || to < from) throw new Error(`sandbox.md has no ${start} … ${end} block`)
        // A block inside a sentence stays on its line; a block of its own gets lines of its own.
        const inline = !body.includes("\n") && out[from - 1] !== "\n"
        out = inline
            ? `${out.slice(0, from + start.length)}${body}${out.slice(to)}`
            : `${out.slice(0, from + start.length)}${eol}${body}${eol}${out.slice(to)}`
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
