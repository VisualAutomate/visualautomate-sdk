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
- A step that is one HTTP request (an \`action\` block in the manifest) or a trigger (a \`trigger\` block) has no \`index.js\`.
- A \`plugin.ts\` made by \`vsa init\` is a local playground; the files above are what gets published.

## Rules the platform enforces

1. \`index.js\` is CommonJS, loaded as written: \`module.exports = { execute: async (input, config, context) => ... }\`, with \`/** @type {PluginModule} */\` above it.
2. The word \`import\` may not appear anywhere in \`index.js\`, comments included. Neither may \`eval(\`, \`Function(\`, \`process.env\`, \`globalThis\`, \`Reflect\`, \`Proxy\`, \`constructor\`, \`__proto__\` or \`WebAssembly\`.
3. \`require\` only allowed npm packages, by bare name and with a string literal. No \`fs\`, \`http\`, \`os\`, \`child_process\` or \`Buffer\`; use \`context.storage\`, \`fetch\` and \`Uint8Array\`.
4. Never read or hold a credential. A connected account is \`context.connections.get("<connection property>")\` and \`request({ path })\` with a path relative to the provider.
5. A user's own key is a \`secret\` property; a key the plugin holds is \`context.secrets\`. Nothing secret goes in the repository.
6. Return \`{ output, data }\`, where \`output\` is one of the manifest's \`outputs\`. Expected failures leave by \`"error"\` with a readable \`data.error\`.
7. Limits: \`timeoutMs\` at most 60000, \`memoryLimitMb\` at most 128, a state value at most 128 KB.

## Checking

- \`vsa test\` runs the platform's check on a code step (\`vsa test <module>\` for one module of an app). Fix the code until it passes; never weaken the check.
- \`context.connections\` and \`context.media\` cannot run locally: the code checks still pass, and the step must leave by \`error\` when no account is chosen.
- Declared steps and triggers are tested in the developer portal's editor, not by \`vsa test\`.

Publishing is done by the developer, from GitHub, on https://developers.visualautomate.com.
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
