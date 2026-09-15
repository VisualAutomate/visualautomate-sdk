/**
 * What a plugin is handed, and what it must hand back.
 *
 * This file is the contract between a plugin and the VisualAutomate runtime:
 * the arguments `execute` is called with, every helper on `context`, the shape
 * of the result, and the manifest that declares the step. When a helper is only
 * present under some condition, that is said here rather than left for somebody
 * to discover from a TypeError.
 *
 * context-api.ts describes the same runtime as data, for tools that cannot read
 * a TypeScript interface, such as an editor's autocomplete.
 */

// ─── What a step is called with ─────────────────────────────────────────────

/**
 * The output of the steps that led here, keyed by step name and node id.
 *
 * A step reads `input.download_clips.file` where `download_clips` is what the
 * step before it is called on the canvas. Every route into this step is merged,
 * so a step at the join of two branches sees both.
 */
export interface PluginInput {
    [key: string]: unknown
}

/** The fields somebody filled in on the canvas, as the manifest declared them. */
export interface PluginConfig {
    [key: string]: unknown
}

// ─── context.storage ────────────────────────────────────────────────────────

/** What `storage.put` reports about the file it wrote. */
export interface StorageResult {
    url: string
    size: number
    contentType: string
    uploadedAt: string
    expiresAt: string
}

/** What `storage.list` reports. */
export interface StorageListResult {
    files: Array<{
        url: string
        pathname: string
        size: number
        uploadedAt: string
    }>
    totalSize: number
}

/**
 * The account's own files. Paths are scoped to the user; you cannot name
 * anybody else's, and you do not have to prefix your own.
 *
 * The account's plan caps what it may hold at once, and a `put` past that
 * ceiling is refused rather than silently dropped.
 */
export interface PluginStorage {
    /** Write a file. Bytes may be a string, a Buffer or any typed array. */
    put(path: string, data: Uint8Array | string, contentType?: string): Promise<StorageResult>
    /** Read a file back. `null` when it is not there. */
    get(path: string): Promise<Uint8Array | null>
    delete(path: string): Promise<void>
    /** Everything under a prefix, or everything when no prefix is given. */
    list(prefix?: string): Promise<StorageListResult>
    /** Size and content type without moving the bytes. `null` when absent. */
    head(path: string): Promise<{ size: number; contentType: string } | null>
    /**
     * A URL somebody else can fetch this file from, for a few minutes.
     *
     * For the common API that takes a link and pulls the file itself. Clamped
     * to between one minute and one hour; the default is fifteen minutes.
     */
    signedUrl(path: string, expiresInSeconds?: number): Promise<string | null>
    /**
     * Pull a URL straight into storage without the bytes passing through this
     * step. A hundred-megabyte file costs the run no memory and no egress,
     * because a Worker fetches it and writes it to storage directly.
     *
     * ONLY PRESENT when the download Worker is configured on the server. Guard
     * with `if (context.storage.download)` if you want to degrade gracefully.
     */
    download?(url: string, path: string, contentType?: string): Promise<StorageResult>
}

// ─── context.state ──────────────────────────────────────────────────────────

/**
 * Values that outlive one run, scoped to this workflow and this account.
 *
 * For a cursor, a last-seen id, a counter — the things a workflow needs to
 * remember between firings. Not for large data: that is what storage is for.
 * The account's plan caps how many keys it may hold.
 */
export interface PluginState {
    /** The stored value, or `null` when the key has never been set. */
    get(key: string): Promise<unknown>
    set(key: string, value: unknown, options?: { ttlSeconds?: number }): Promise<void>
    delete(key: string): Promise<void>
    list(prefix?: string): Promise<{ keys: string[] }>
}

// ─── context.media ──────────────────────────────────────────────────────────

/**
 * ffmpeg, for a step that has a file in storage and wants a different one.
 *
 * A PLUGIN NEVER BUILDS AN FFMPEG COMMAND LINE, and cannot. You name an
 * operation and supply values; the command line is assembled on the server, one
 * operation at a time, and the only paths in it are placeholders the container
 * fills from a list the server wrote. That is deliberate: `-i` takes any path
 * and several filters open files of their own, so an ffmpeg taking its flags
 * from plugin config would be a plugin reading the container's filesystem —
 * including the file holding that run's own credentials.
 *
 * The job runs in a container of its own and talks to storage directly, so a
 * two hundred megabyte clip never crosses this step.
 *
 * ONLY PRESENT when the sandbox and storage are both configured.
 */
export interface PluginMedia {
    run(operation: string, params: Record<string, unknown>): Promise<Record<string, unknown>>
}

// ─── context.connections ────────────────────────────────────────────────────

/** One request through the integration proxy. */
export interface ConnectionRequest {
    path: string
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    query?: Record<string, string | number | boolean | undefined>
    headers?: Record<string, string>
    body?: unknown
}

/** What the proxy answers with. The provider's own reply, unwrapped. */
export interface ConnectionResponse {
    ok: boolean
    status: number
    headers?: Record<string, string>
    body: unknown
}

/**
 * One of the accounts the user connected.
 *
 * THERE IS NO getToken(), deliberately. A token that can be read can be logged
 * or posted somewhere, and this is where third-party code runs. You name a path
 * and the proxy attaches the credential on the way past.
 *
 * You also never name a host. The base URL belongs to the provider
 * configuration, which is what stops a connection being pointed at an internal
 * address or at somebody's collection server.
 */
export interface PluginConnection {
    /** This platform's id for the connection, not the provider's. */
    id: string
    request(options: ConnectionRequest): Promise<ConnectionResponse>
}

/**
 * The accounts this step was configured with.
 *
 * `get` takes the name of one of your own `connection` properties — not a
 * connection id — so a step can only reach the accounts it was set up with.
 *
 * ONLY PRESENT when the step declares at least one `connection` property and
 * the user has chosen an account for it.
 */
export interface PluginConnections {
    get(propertyName: string): Promise<PluginConnection>
}

// ─── The context itself ─────────────────────────────────────────────────────

/**
 * Everything a step is told about the run it is part of.
 *
 * The optional members are optional for a reason and not out of caution: each
 * is absent when the thing behind it is not configured or not applicable, and
 * a plugin that needs one should say so plainly rather than crash on a dot.
 */
export interface PluginContext {
    /** The workflow this run belongs to. */
    workflowId: string
    /** This step's id on the canvas. */
    nodeId: string
    /** Whose run it is. */
    userId: string
    /** This run, distinct from every other run of the same workflow. */
    executionId: string
    /** When the run started, as an ISO string. */
    startedAt: string
    /** Values the plugin was published with. Not the user's credentials. */
    secrets: Record<string, string>

    /** The account's files. See PluginStorage. */
    storage: PluginStorage
    /** Values that outlive one run. See PluginState. */
    state: PluginState
    /** ffmpeg. Absent when the server has no sandbox or storage configured. */
    media?: PluginMedia
    /** The accounts this step was configured with. Absent when it has none. */
    connections?: PluginConnections
}

// ─── What a step hands back ─────────────────────────────────────────────────

/**
 * The result of a step.
 *
 * `output` names which port the run leaves by, and therefore which lines on the
 * canvas are followed. It has to be one of the `outputs` in the manifest —
 * usually `"success"` or `"error"`.
 *
 * `data` is what the next steps read as `{{this_step.field}}`. Keep it flat and
 * named for what it is; those names are what somebody picks from a dropdown.
 */
export interface PluginOutput {
    output: string
    data: Record<string, unknown>
    metadata?: {
        durationMs?: number
        memoryUsedMb?: number
        logs?: string[]
    }
}

/**
 * A plugin.
 *
 * Export `execute`, either as `module.exports.execute` or as the default export
 * of a module with an `execute` on it. Both are accepted, and so is a bare
 * function as the default export.
 *
 * @example
 * export default {
 *   async execute(input, config, context) {
 *     const file = await context.storage.get(config.path as string)
 *     return { output: "success", data: { bytes: file?.length ?? 0 } }
 *   }
 * }
 */
export interface PluginModule {
    execute(
        input: PluginInput,
        config: PluginConfig,
        context: PluginContext,
    ): Promise<PluginOutput> | PluginOutput
}

/** The bare function form, for a plugin that is only an execute. */
export type PluginExecute = PluginModule["execute"]

// ─── How a run reports on a step ────────────────────────────────────────────

/**
 * `skipped` is a decision rather than a fault: the filters on every line into
 * the step said no, so it never ran. Counting it as an error turns a branch
 * that was simply not chosen into a broken workflow.
 */
export type ExecutionStatus = "success" | "error" | "timeout" | "skipped" | "cancelled"

export interface PluginExecutionResult {
    status: ExecutionStatus
    output: PluginOutput | null
    error?: string
    durationMs: number
    memoryMb?: number
    outputPort?: string
    logs?: string[]
}

// ─── The manifest ───────────────────────────────────────────────────────────

/**
 * The declaration that sits beside the code.
 *
 * It says which fields the canvas renders, which account the step acts as, what
 * it hands downstream, and whether it is a starting point that watches
 * something. One shape wherever it is stored — `manifest.json` next to your
 * code, or an `@schema` comment in the source.
 *
 * Every name below is one the platform keeps. A block it does not recognise is
 * dropped when the plugin is saved, so a field that is not listed here will not
 * survive an upload.
 */
export type PluginPropertyType =
    | "string"
    | "number"
    | "boolean"
    | "select"
    | "multiselect"
    | "json"
    /**
     * A program, not a value.
     *
     * Stored exactly as typed and never parsed, which is the difference from
     * `json` above: that one keeps its value structured, so `return 5` would be
     * saved as the number five and the step would run nothing.
     */
    | "code"
    | "color"
    | "date"
    /** An account the user connected. Rendered as a picker, not a text box. */
    | "connection"
    /**
     * A file the account already has, read into the config before the step
     * runs. `{{config.attachment.name}}`, `.contentType`, `.size`,
     * `.contentBytes`. Right for attaching a PDF; a video would be hundreds of
     * megabytes of base64 — use `path` for those.
     */
    | "file"
    /** A file in storage, named rather than read. What ffmpeg steps take. */
    | "path"
    /** Several of them, one per line, in the order they were chosen. */
    | "paths"

export interface PluginProperty {
    /** Shown above the input on the canvas. Defaults to the property name. */
    label: string
    type: PluginPropertyType
    required?: boolean
    default?: unknown
    /** Helper text under the input. */
    description?: string
    /** For `select` and `multiselect`. */
    options?: Array<{ label: string; value: string }>
    /** Puts related fields in a section together. */
    group?: string
    /** For `number`. */
    min?: number
    max?: number
    /** For `string`: a regex the value must match. */
    pattern?: string
    /**
     * For `connection`: which integration the account must belong to, e.g.
     * `outlook`. A module inherits its app's, so it does not repeat this.
     */
    provider?: string
}

/**
 * How a step reaches the account it acts as.
 *
 * `none` means the plugin holds its own key in a property. That is not the same
 * as leaving the block out, which means "written before auth could be
 * declared".
 *
 * A MANIFEST MAY NOT NAME A HOST. `url`, `baseUrl`, `base_url` and `host` are
 * refused outright rather than ignored, so nobody writes one and believes it
 * took effect: the base URL belongs to the provider configuration, and that is
 * what stops a connection being pointed at an internal address.
 */
export interface PluginAuth {
    type: "oauth2" | "api_key" | "basic" | "none"
    provider?: string
    scopes?: string[]
}

/** One request the platform makes on your behalf. Relative paths only. */
export interface TriggerRequest {
    method?: "GET" | "POST"
    /** Relative to the provider's base URL. The proxy refuses anything else. */
    path: string
    query?: Record<string, string>
    headers?: Record<string, string>
    body?: unknown
}

/** Where the next poll should carry on from. */
export interface TriggerCursor {
    from: "response" | "item"
    /** Dotted path to the value. `@odata.deltaLink` is one key, not two. */
    path: string
    into?: string
}

/**
 * A second request per item, for providers that answer with identifiers.
 *
 * Gmail's message list returns `{ id, threadId }` — enough to know a mail
 * arrived, not enough to tell anyone what it says. Without this the trigger
 * polls correctly, dedupes correctly, and hands every workflow an empty
 * message, which is the worst kind of working.
 */
export interface TriggerHydrate {
    path: string
    method?: "GET" | "POST"
    query?: Record<string, string>
    headers?: Record<string, string>
}

/** For providers that can tell us instead of being asked. */
export interface TriggerPush {
    resource: string
    changeType: string
    maxMinutes?: number
}

/**
 * What makes a plugin a starting point.
 *
 * A declaration rather than code, because the runtime is billed by the second
 * and a step blocking on an empty inbox would be paid for every second of doing
 * nothing. The platform polls for you and starts the workflow when something
 * arrives.
 */
export interface PluginTrigger {
    /** Must name one of your own properties of type `connection`. */
    connection: string
    /** Minutes between checks. The account's plan sets the floor. */
    poll?: string | number
    request: TriggerRequest
    /** Dotted path to the array of items in the response. */
    items: string
    /** Dotted path, within one item, to what makes it unique. */
    id: string
    cursor?: TriggerCursor
    hydrate?: TriggerHydrate
    push?: TriggerPush
    /** How many items one poll may start workflows for. */
    maxPerPoll?: number
}

/**
 * A step that is a declaration rather than a program.
 *
 * One request built from the properties somebody filled in, or no request at
 * all for a step that only reshapes what reached it. No container, no code, and
 * nothing for a review to be about — which is why most steps should be one.
 *
 * Left loosely typed here on purpose: writing an action is a different job from
 * writing a plugin, and the platform validates its shape when it is saved.
 */
export type PluginAction = Record<string, unknown>

/**
 * Every block the validator keeps. Anything else is dropped on save.
 *
 * Note what is NOT here: the hosts a plugin may contact are set on the platform
 * rather than declared in the manifest, so a plugin cannot widen its own egress.
 */
export interface PluginManifest {
    description?: string
    icon?: string
    color?: string
    /** Bumped by you when the declaration changes shape. */
    version?: number
    /** How long one run may take. Capped by the account's plan. */
    timeoutMs?: number
    memoryLimitMb?: number
    auth?: PluginAuth
    properties?: Record<string, PluginProperty>
    inputs?: string[]
    outputs?: string[]
    /** What downstream steps can read, described for the picker. */
    outputFields?: Record<string, string>
    trigger?: PluginTrigger
    action?: PluginAction
}

/** The older name for the same thing, kept because authors still say it. */
export type PluginSchema = PluginManifest
