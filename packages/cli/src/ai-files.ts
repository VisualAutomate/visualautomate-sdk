/**
 * What an AI assistant needs to build a step in this project.
 *
 * Two kinds of file, for two kinds of assistant:
 *
 *   AGENTS.md / CLAUDE.md   read on their own by Codex, Cursor, Copilot, Claude
 *                           Code and others whenever they work in the folder.
 *                           Short: the rules that make the platform refuse a
 *                           step, and where the full reference is. CLAUDE.md is
 *                           one line that pulls AGENTS.md in, so there is one
 *                           text to keep true.
 *   the skill               skills/visualautomate-steps in this repository: a
 *                           SKILL.md with the whole workflow, references and
 *                           examples that are tested here. Installed for Claude
 *                           Code under .claude/skills, or anywhere with --dir.
 *
 * Ours is recognised by a marker on the first line, as with the type
 * declarations: a copy we wrote is brought up to date, a file somebody wrote
 * themselves is never touched.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { PLATFORM_NODE_MAJOR } from "@visualautomate/plugin-sdk"

import { SKILL_FILES } from "./skill-files"

export const SKILL_NAME = "visualautomate-steps"
export const AGENTS_FILE = "AGENTS.md"
export const CLAUDE_FILE = "CLAUDE.md"

/** The first line of every AGENTS.md and CLAUDE.md this CLI writes. */
export const AGENTS_MARKER = "<!-- Written by the VisualAutomate CLI: `vsa skill` keeps it current. Replace this line to keep your own edits. -->"

export function agentsFor(version: string): string {
    return `${AGENTS_MARKER}

# Building VisualAutomate steps here

This folder holds VisualAutomate steps: modules that run on the VisualAutomate workflow canvas. (CLI ${version})

Before writing or changing a step, read the full guide: \`.claude/skills/${SKILL_NAME}/SKILL.md\` if it is here (\`vsa skill\` puts it there), otherwise https://docs.visualautomate.com/developers/overview or, all in one file, https://docs.visualautomate.com/llms-full.txt.

## Shape

- A plugin: \`manifest.json\`, \`index.js\` and \`visualautomate.test.json\` at the root.
- An app: one folder per module under \`modules/<slug>/\`, each with those three files.
- A step that is one HTTP request (an \`action\` block in the manifest) has no \`index.js\`, and is not published from GitHub: it is created on the developer portal as New module → Call an API, with its manifest.json pasted into the module's editor. Keep a copy here and check it with \`vsa test\`.
- A \`plugin.ts\` made by \`vsa init\` is a local playground; the files above are what gets published.

## Rules the platform enforces

1. \`index.js\` is CommonJS, loaded as written: \`module.exports = { execute: async (input, config, context) => ... }\`, with \`/** @type {PluginModule} */\` above it.
2. The word \`import\` may not appear anywhere in \`index.js\`, comments included. Neither may \`eval(\`, \`Function(\`, \`process.env\`, \`globalThis\`, \`Reflect\`, \`Proxy\`, \`constructor\`, \`__proto__\` or \`WebAssembly\`.
3. \`require\` only allowed npm packages, by bare name and with a string literal. No \`fs\`, \`http\`, \`os\`, \`child_process\` or \`Buffer\`; use \`context.storage\`, \`fetch\` and \`Uint8Array\`.
   Steps run on Node ${PLATFORM_NODE_MAJOR} in a context with only the platform's globals: no \`process\`, \`globalThis\`, \`structuredClone\` or \`setImmediate\`, and \`console\` has \`log\`, \`error\`, \`warn\` and \`info\` only. End \`index.js\` with a newline.
4. Never read or hold a credential. A connected account is \`context.connections.get("<connection property>")\` and \`request({ path })\` with a path relative to the provider.
5. A user's own key is a \`secret\` property; a key the plugin holds is \`context.secrets\`. Nothing secret goes in the repository.
6. Return \`{ output, data }\`, where \`output\` is one of the manifest's \`outputs\`. Expected failures leave by \`"error"\` with a readable \`data.error\`.
7. Limits: \`timeoutMs\` at most 60000 (the push check gives 30000 when the manifest names none), \`memoryLimitMb\` at most 128, a state value at most 128 KB, \`index.js\` at most 100,000 characters.

## Checking

- \`vsa test\` is the push check, here (\`vsa test <module>\` for one module of an app): it checks every manifest, and loads and runs every code step the way the platform does. Fix the code until it passes; never weaken the check.
- A run must leave by the test file's \`expectOutput\`, which is \`success\` when it names none.
- Locally there is no connected account: \`context.connections\` is absent, so check for it. \`context.media\` only runs on the platform.
- Declared steps are checked by \`vsa test\`, then pasted into the portal, run with Try it, and published there.

Publishing is done by the developer, from GitHub, on https://developers.visualautomate.com, and needs one push whose test came back on \`success\`. For a step that acts as an account, that means the id of a connected account under \`config\` in visualautomate.test.json (the module's page on the portal lists them).
`
}

export const CLAUDE_TEXT = `${AGENTS_MARKER}

@${AGENTS_FILE}
`

/**
 * Write AGENTS.md and CLAUDE.md into `root` where they are missing or ours and
 * out of date. Returns what was written.
 */
export function ensureAgentFiles(root: string, version: string): string[] {
    const written: string[] = []
    for (const [name, wanted] of [
        [AGENTS_FILE, agentsFor(version)],
        [CLAUDE_FILE, CLAUDE_TEXT],
    ] as const) {
        const path = join(root, name)
        const current = existsSync(path) ? readFileSync(path, "utf8") : null
        if (current === null || (current.startsWith(AGENTS_MARKER) && current !== wanted)) {
            writeFileSync(path, wanted)
            written.push(name)
        }
    }
    return written
}

/** The files AGENTS.md and CLAUDE.md that are somebody else's, and so were left alone. */
export function foreignAgentFiles(root: string): string[] {
    return [AGENTS_FILE, CLAUDE_FILE].filter((name) => {
        const path = join(root, name)
        return existsSync(path) && !readFileSync(path, "utf8").startsWith(AGENTS_MARKER)
    })
}

/**
 * Write the skill's files into `dir` (the folder that will hold SKILL.md).
 *
 * Every file the skill ships is written as this CLI has it; anything else in
 * the folder is left where it is. Returns how many files changed.
 */
export function installSkill(dir: string): number {
    let changed = 0
    for (const [rel, text] of Object.entries(SKILL_FILES)) {
        const path = join(dir, rel)
        if (existsSync(path) && readFileSync(path, "utf8") === text) continue
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, text)
        changed++
    }
    return changed
}

export function skillFileCount(): number {
    return Object.keys(SKILL_FILES).length
}
