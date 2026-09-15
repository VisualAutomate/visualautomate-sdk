/**
 * Running a plugin on your own machine, with a context that behaves.
 *
 * Storage and state are implemented here, in memory, with the same
 * signatures and the same edge cases the real ones have: `get` on a missing key
 * is `null` rather than a throw, `put` accepts a string or bytes, `list` is
 * prefix-filtered. A plugin that works against these works against the real
 * ones, which is the only property that makes a simulator worth having.
 *
 * WHAT IS DELIBERATELY NOT IMPLEMENTED: connections and media. Both are other
 * people's systems — an OAuth account and an ffmpeg container — and pretending
 * to be them would produce a plugin that passes here and fails on the canvas.
 * They are absent unless you pass a stub, and asking for one you did not stub
 * fails with a sentence saying so rather than with `undefined`.
 */

import type {
    PluginConnections,
    PluginContext,
    PluginExecutionResult,
    PluginMedia,
    PluginModule,
    PluginOutput,
    PluginState,
    PluginStorage,
    StorageListResult,
    StorageResult,
} from "./types"

/** A file held in memory, as the local storage keeps it. */
interface LocalFile {
    bytes: Uint8Array
    contentType: string
    uploadedAt: string
}

function toBytes(data: Uint8Array | string): Uint8Array {
    return typeof data === "string" ? new TextEncoder().encode(data) : data
}

/**
 * The account's files, in memory.
 *
 * Seeded from `options.storage` so a test can start with a file already there,
 * and readable afterwards through the returned `files` — which is how you
 * assert that a step wrote what it said it wrote.
 */
export function createLocalStorage(seed: Record<string, Uint8Array | string> = {}): {
    storage: PluginStorage
    files: Map<string, LocalFile>
} {
    const files = new Map<string, LocalFile>()
    for (const [path, data] of Object.entries(seed)) {
        files.set(path, {
            bytes: toBytes(data),
            contentType: "application/octet-stream",
            uploadedAt: new Date().toISOString(),
        })
    }

    const result = (path: string, file: LocalFile): StorageResult => ({
        url: `memory://${path}`,
        size: file.bytes.length,
        contentType: file.contentType,
        uploadedAt: file.uploadedAt,
        // The real one expires; this one does not, and says so rather than
        // inventing a date a test might come to rely on.
        expiresAt: "never (local simulation)",
    })

    const storage: PluginStorage = {
        async put(path, data, contentType = "application/octet-stream") {
            const file: LocalFile = {
                bytes: toBytes(data),
                contentType,
                uploadedAt: new Date().toISOString(),
            }
            files.set(path, file)
            return result(path, file)
        },
        async get(path) {
            return files.get(path)?.bytes ?? null
        },
        async delete(path) {
            files.delete(path)
        },
        async list(prefix) {
            const listed: StorageListResult["files"] = []
            let totalSize = 0
            for (const [path, file] of files) {
                if (prefix && !path.startsWith(prefix)) continue
                listed.push({
                    url: `memory://${path}`,
                    pathname: path,
                    size: file.bytes.length,
                    uploadedAt: file.uploadedAt,
                })
                totalSize += file.bytes.length
            }
            return { files: listed, totalSize }
        },
        async head(path) {
            const file = files.get(path)
            return file ? { size: file.bytes.length, contentType: file.contentType } : null
        },
        async signedUrl(path) {
            return files.has(path) ? `memory://${path}` : null
        },
        /**
         * Really fetches, because that is the only way to find out whether the
         * URL a plugin builds is the URL it meant. The bytes land in the same
         * in-memory store the rest of these read from.
         */
        async download(url, path, contentType) {
            const res = await fetch(url)
            if (!res.ok) throw new Error(`Downloading ${url} failed with status ${res.status}`)
            const file: LocalFile = {
                bytes: new Uint8Array(await res.arrayBuffer()),
                contentType: contentType ?? res.headers.get("content-type") ?? "application/octet-stream",
                uploadedAt: new Date().toISOString(),
            }
            files.set(path, file)
            return result(path, file)
        },
    }

    return { storage, files }
}

/** Workflow state, in memory. `values` is there so a test can look afterwards. */
export function createLocalState(seed: Record<string, unknown> = {}): {
    state: PluginState
    values: Map<string, unknown>
} {
    const values = new Map<string, unknown>(Object.entries(seed))
    const state: PluginState = {
        async get(key) {
            // `null` for a key that was never set, matching the real one. A
            // plugin that treats `undefined` and `null` differently should find
            // out here rather than on somebody's canvas.
            return values.has(key) ? values.get(key) : null
        },
        async set(key, value) {
            values.set(key, value)
        },
        async delete(key) {
            values.delete(key)
        },
        async list(prefix) {
            const keys = [...values.keys()].filter((k) => !prefix || k.startsWith(prefix))
            return { keys }
        },
    }
    return { state, values }
}

/** What a helper says when it is asked for and was not provided. */
function absent(name: string, what: string): never {
    throw new Error(
        `context.${name} is not available locally. ${what} `
        + `Pass a stub to simulate({ ${name}: … }) to test the code around it, `
        + `or run the step on a canvas to exercise the real thing.`,
    )
}

export interface SimulateOptions {
    /** What the steps before this one produced. */
    input?: Record<string, unknown>
    /** The fields somebody filled in on the canvas. */
    config?: Record<string, unknown>
    /** What the plugin was published with. */
    secrets?: Record<string, string>

    /** Files the account already has, as `{ "path/name.txt": "contents" }`. */
    storage?: Record<string, Uint8Array | string>
    /** Workflow state the run starts with. */
    state?: Record<string, unknown>
    /**
     * Stand-ins for the two helpers that cannot be simulated honestly.
     *
     * Give `connections` a fake that answers the requests your plugin makes,
     * and assert on what it was asked for — that is a better test of an
     * integration step than any simulation of a provider would be.
     */
    connections?: PluginConnections
    media?: PluginMedia

    workflowId?: string
    nodeId?: string
    userId?: string
    executionId?: string
    /** How long the plugin may take, as the account's plan would cap it. */
    timeoutMs?: number
}

/** What `simulate` gives back: the result, and what the run left behind. */
export interface SimulateResult extends PluginExecutionResult {
    /** The files in storage when the step finished. */
    files: Map<string, LocalFile>
    /** The workflow state when the step finished. */
    state: Map<string, unknown>
}

/**
 * Run a plugin's `execute` the way the sandbox would.
 *
 * Same context shape, same timeout race, same normalising of the return value —
 * so a result that is `success` here is one the platform would also call
 * `success`.
 */
export async function simulate(
    plugin: PluginModule | PluginModule["execute"],
    options: SimulateOptions = {},
): Promise<SimulateResult> {
    const startTime = Date.now()

    const execute = typeof plugin === "function" ? plugin : plugin?.execute
    const { storage, files } = createLocalStorage(options.storage)
    const { state, values } = createLocalState(options.state)

    if (typeof execute !== "function") {
        return {
            status: "error",
            output: null,
            error:
                "This module exports no execute function. A plugin is `export default { execute }`, "
                + "`module.exports.execute = …`, or a default export that is the function itself.",
            durationMs: Date.now() - startTime,
            files,
            state: values,
        }
    }

    const context: PluginContext = {
        workflowId: options.workflowId ?? "local-workflow",
        nodeId: options.nodeId ?? "local-node",
        userId: options.userId ?? "local-user",
        executionId: options.executionId ?? `local-${Date.now()}`,
        startedAt: new Date(startTime).toISOString(),
        secrets: options.secrets ?? {},
        storage,
        state,
        connections:
            options.connections ??
            ({
                get: async () =>
                    absent("connections", "It reaches an account somebody connected on the platform."),
            } as PluginConnections),
        media:
            options.media ??
            ({
                run: async () => absent("media", "It runs ffmpeg in a container of its own."),
            } as PluginMedia),
    }

    const timeoutMs = options.timeoutMs ?? 30_000
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`Plugin execution timed out after ${timeoutMs}ms`)),
            timeoutMs,
        )
    })

    try {
        const raw = await Promise.race([
            Promise.resolve(execute(options.input ?? {}, options.config ?? {}, context)),
            timeout,
        ])

        const durationMs = Date.now() - startTime

        if (!raw || typeof raw !== "object") {
            return {
                status: "error",
                output: null,
                error:
                    "A plugin must return an object like { output: \"success\", data: {} }. "
                    + `This one returned ${raw === undefined ? "undefined" : JSON.stringify(raw)}.`,
                durationMs,
                files,
                state: values,
            }
        }

        const output = raw as PluginOutput
        if (typeof output.output !== "string") {
            return {
                status: "error",
                output: null,
                error:
                    "The returned object has no `output`. That field names which port the run leaves "
                    + "by — usually \"success\" or \"error\" — and it has to be one of the `outputs` "
                    + "in your manifest.",
                durationMs,
                files,
                state: values,
            }
        }

        return {
            status: "success",
            output: { ...output, data: output.data ?? {} },
            durationMs,
            outputPort: output.output,
            logs: output.metadata?.logs,
            files,
            state: values,
        }
    } catch (error) {
        const durationMs = Date.now() - startTime
        const message = error instanceof Error ? error.message : String(error)
        return {
            status: message.includes("timed out") ? "timeout" : "error",
            output: null,
            error: message,
            durationMs,
            files,
            state: values,
        }
    } finally {
        if (timer) clearTimeout(timer)
    }
}
