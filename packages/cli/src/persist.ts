/**
 * Storage and state that outlive a run.
 *
 * `simulate` keeps both in memory, which is right for a test: every run starts
 * from what the test file says. While developing it helps to see what a step
 * wrote and to run it again against that — a counter in state that goes up, a
 * file a previous run produced. With `--persist`, or once a `.visualautomate/`
 * folder exists next to the plugin, both are kept on disk:
 *
 *   .visualautomate/storage/<path>   the account's files
 *   .visualautomate/state.json       the workflow state
 *
 * A run starts from what is there, with the test file's `storage` and `state`
 * filling in anything missing, and writes back what the run left behind.
 */

import { existsSync } from "node:fs"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"

export const PERSIST_DIR = ".visualautomate"

export function persistEnabled(dir: string, flag: string | undefined): boolean {
    return flag === "true" || existsSync(join(dir, PERSIST_DIR))
}

/**
 * Where a storage path lands on disk, or null when it would land outside the
 * storage folder. Storage paths are the plugin's to choose, and `../../x` is a
 * path too.
 */
export function diskPathFor(storageRoot: string, path: string): string | null {
    if (!path || path.includes("\0")) return null
    const target = resolve(storageRoot, path)
    const rel = relative(storageRoot, target)
    if (!rel || rel.startsWith("..") || rel.split(sep).includes("..") || resolve(rel) === rel) return null
    return target
}

async function walk(root: string, dir = root): Promise<string[]> {
    if (!existsSync(dir)) return []
    const entries = await readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(
        entries.map((entry) => (entry.isDirectory() ? walk(root, join(dir, entry.name)) : Promise.resolve([join(dir, entry.name)]))),
    )
    return nested.flat()
}

export async function loadPersisted(dir: string): Promise<{
    storage: Record<string, Uint8Array>
    state: Record<string, unknown>
}> {
    const storageRoot = join(dir, PERSIST_DIR, "storage")
    const storage: Record<string, Uint8Array> = {}
    for (const file of await walk(storageRoot)) {
        storage[relative(storageRoot, file).split(sep).join("/")] = new Uint8Array(await readFile(file))
    }

    let state: Record<string, unknown> = {}
    const statePath = join(dir, PERSIST_DIR, "state.json")
    if (existsSync(statePath)) {
        try {
            const parsed = JSON.parse(await readFile(statePath, "utf8"))
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) state = parsed
        } catch {
            throw new Error(`${statePath} is not valid JSON. Fix it, or delete it to start from empty state.`)
        }
    }
    return { storage, state }
}

/** Write back what a run left. Returns the storage paths that were refused. */
export async function savePersisted(
    dir: string,
    files: Map<string, { bytes: Uint8Array }>,
    state: Map<string, unknown>,
): Promise<string[]> {
    const storageRoot = join(dir, PERSIST_DIR, "storage")
    const refused: string[] = []
    const keep = new Set<string>()

    for (const [path, file] of files) {
        const target = diskPathFor(storageRoot, path)
        if (!target) {
            refused.push(path)
            continue
        }
        keep.add(target)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, file.bytes)
    }
    // A file the run deleted is gone from disk too.
    for (const existing of await walk(storageRoot)) {
        if (!keep.has(existing)) await rm(existing)
    }

    await mkdir(join(dir, PERSIST_DIR), { recursive: true })
    await writeFile(join(dir, PERSIST_DIR, "state.json"), JSON.stringify(Object.fromEntries(state), null, 2) + "\n")
    return refused
}
