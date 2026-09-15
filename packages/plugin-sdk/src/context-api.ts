/**
 * The runtime API, as data.
 *
 * The same things types.ts describes, in a form a tool can read without a
 * TypeScript compiler: an editor's autocomplete, a documentation page, a lint
 * rule. Each entry is a name an author types, what it is, and a one-line
 * description.
 *
 * Plain data with no imports, so it can go into a browser bundle without the
 * rest of the SDK.
 */

export interface ContextApiEntry {
    /** What an author types, e.g. `context.storage.put`. */
    path: string
    /** `property` for a value, `method` for something you call. */
    kind: "variable" | "property" | "method"
    /** The signature, for a method. Shown beside the name. */
    signature?: string
    /** One line, in the hover card. */
    info: string
    /**
     * Set when the helper is not always there.
     *
     * The editor says so, because the alternative is an author writing
     * `context.media.run(...)` against a completion that promised it existed
     * and meeting `undefined` on somebody's canvas.
     */
    conditional?: string
}

/** Everything a plugin is called with, and everything it can reach. */
export const CONTEXT_API: ContextApiEntry[] = [
    { path: "input", kind: "variable", info: "What the steps before this one produced, keyed by step name." },
    { path: "config", kind: "variable", info: "The fields somebody filled in on the canvas." },
    { path: "context", kind: "variable", info: "Everything about the run: ids, storage, state, media, connections." },

    { path: "context.workflowId", kind: "property", info: "The workflow this run belongs to." },
    { path: "context.nodeId", kind: "property", info: "This step's id on the canvas." },
    { path: "context.userId", kind: "property", info: "Whose run it is." },
    { path: "context.executionId", kind: "property", info: "This run, distinct from every other run of the workflow." },
    { path: "context.startedAt", kind: "property", info: "When the run started, as an ISO string." },
    { path: "context.secrets", kind: "property", info: "Values the plugin was published with. Never the user's credentials." },

    {
        path: "context.storage.put",
        kind: "method",
        signature: "(path, data, contentType?) => Promise<StorageResult>",
        info: "Write a file to the account's storage. Data may be a string or bytes.",
    },
    {
        path: "context.storage.get",
        kind: "method",
        signature: "(path) => Promise<Uint8Array | null>",
        info: "Read a file back. null when it is not there.",
    },
    { path: "context.storage.delete", kind: "method", signature: "(path) => Promise<void>", info: "Remove a file." },
    {
        path: "context.storage.list",
        kind: "method",
        signature: "(prefix?) => Promise<{ files, totalSize }>",
        info: "Everything under a prefix, or everything.",
    },
    {
        path: "context.storage.head",
        kind: "method",
        signature: "(path) => Promise<{ size, contentType } | null>",
        info: "Size and content type without moving the bytes.",
    },
    {
        path: "context.storage.signedUrl",
        kind: "method",
        signature: "(path, expiresInSeconds?) => Promise<string | null>",
        info: "A link somebody else can fetch the file from, for a few minutes. For APIs that pull rather than take bytes.",
    },
    {
        path: "context.storage.download",
        kind: "method",
        signature: "(url, path, contentType?) => Promise<StorageResult>",
        info: "Pull a URL straight into storage. The bytes never cross this step, so a large file costs the run nothing.",
        conditional: "Only when the download Worker is configured on the server.",
    },

    {
        path: "context.state.get",
        kind: "method",
        signature: "(key) => Promise<unknown>",
        info: "A value this workflow stored on an earlier run. null when never set.",
    },
    {
        path: "context.state.set",
        kind: "method",
        signature: "(key, value, { ttlSeconds }?) => Promise<void>",
        info: "Remember something between runs — a cursor, a last-seen id, a counter.",
    },
    { path: "context.state.delete", kind: "method", signature: "(key) => Promise<void>", info: "Forget one key." },
    {
        path: "context.state.list",
        kind: "method",
        signature: "(prefix?) => Promise<{ keys }>",
        info: "Which keys this workflow has stored.",
    },

    {
        path: "context.media.run",
        kind: "method",
        signature: "(operation, params) => Promise<Record<string, unknown>>",
        info: "ffmpeg, by operation name. A plugin never builds a command line — the server does, one operation at a time.",
        conditional: "Only when the sandbox and storage are both configured.",
    },

    {
        path: "context.connections.get",
        kind: "method",
        signature: "(propertyName) => Promise<{ id, request }>",
        info: "One of the accounts this step was configured with. Takes your property name, not a connection id.",
        conditional: "Only when the step declares a `connection` property and an account was chosen.",
    },
    {
        path: "context.connections.get(...).request",
        kind: "method",
        signature: "({ path, method?, query?, headers?, body? }) => Promise<{ ok, status, body }>",
        info: "A request to the provider, with the credential attached on the way past. Relative paths only — never a host, and there is no getToken().",
    },

    { path: "module.exports.execute", kind: "method", signature: "(input, config, context) => ({ output, data })", info: "The entry point. Return which port to leave by and what to hand on." },
    { path: "console.log", kind: "method", info: "Appears in the run's log panel. Not on stdout — the platform reads that." },
    { path: "console.error", kind: "method", info: "Appears in the run's log panel, marked as an error." },
]

/**
 * The globals a plugin does NOT get, and what to reach for instead.
 *
 * Worth offering in an editor as much as the API is: an author who types
 * `require('fs')` should be told at the keystroke rather than at the push.
 */
export const BLOCKED_GLOBALS: Array<{ name: string; instead: string }> = [
    { name: "process", instead: "Ids and secrets are on `context`." },
    { name: "fs", instead: "Use context.storage." },
    { name: "child_process", instead: "Not available. For ffmpeg, use context.media.run." },
    { name: "os", instead: "Not available." },
    { name: "net", instead: "Use fetch." },
    { name: "http", instead: "Use fetch." },
    { name: "https", instead: "Use fetch." },
    { name: "eval", instead: "Not available." },
    { name: "Function", instead: "Not available as a constructor." },
    { name: "Buffer", instead: "Use Uint8Array and TextEncoder/TextDecoder." },
    { name: "__dirname", instead: "There is no meaningful filesystem." },
]
