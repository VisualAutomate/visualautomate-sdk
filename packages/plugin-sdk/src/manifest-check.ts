/**
 * Check a manifest before the platform does.
 *
 * The developer portal refuses a push whose manifest does not validate, and a
 * declared step (an `action` block) or a trigger has no code for `vsa test` to
 * run, so until now nothing on a developer's machine looked at one at all. This
 * checks what the platform is known to refuse, in the platform's terms, and
 * warns about what it would silently drop or change.
 *
 * It is the SDK's own reading of those rules, written from the platform's
 * behaviour rather than copied from it, so it is a subset: a manifest that
 * passes here can still be refused by the portal, whose word is final. One
 * that fails here would be refused there.
 */
import { PUSH_CHECK } from "./platform-rules"

/** What a manifest makes a step. */
export type StepKind = "code" | "declared" | "outputs-only" | "trigger"

export interface ManifestCheck {
    /** False when the platform would refuse it. */
    ok: boolean
    kind: StepKind
    /** Why the platform would refuse it. */
    errors: string[]
    /** What the platform would drop, change or regret. */
    warnings: string[]
}

const KNOWN_BLOCKS = new Set([
    "properties", "inputs", "outputs", "outputFields", "auth", "trigger", "action",
    "timeoutMs", "memoryLimitMb", "icon", "color", "description", "version",
])
const PROPERTY_TYPES = new Set([
    "string", "number", "boolean", "select", "multiselect", "json", "code", "color", "date",
    "connection", "file", "path", "paths", "secret",
])
const AUTH_TYPES = new Set(["oauth2", "api_key", "basic", "none"])
const HOST_KEYS = ["url", "baseUrl", "base_url", "host"]
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])
const BODY_TYPES = new Set(["json", "form", "multipart"])
const PAGINATE_FROM = new Set(["response", "item", "page", "offset"])
const MAX_ITEM_LIMIT = 1000
const MAX_PAGES = 50
const MAX_MEMORY_MB = 128

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const isRelativePath = (path: unknown): boolean =>
    typeof path === "string" && path.trim() !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(path) && !path.startsWith("//")

/**
 * Check `raw`, the parsed manifest.json. `hasCode` says whether an index.js
 * (or plugin.ts) sits beside it.
 */
/**
 * Why a developer's step cannot use a connected account, and what to do instead.
 *
 * Only VisualAutomate's own apps act as somebody's mailbox, workspace or store.
 * A step built with this SDK reaches an API at its own address, with a key the
 * user enters in a `secret` property.
 */
export const ACCOUNTS_ARE_OURS =
    'Only VisualAutomate\'s own apps act as a connected account: call the API at its own address instead (action.baseUrl, or fetch in code), with a key the user enters in a property of type "secret"'

/** Each way a manifest would use a connected account, in words. Empty when it uses none. */
export function accountUseIn(manifest: unknown): string[] {
    if (!isObject(manifest)) return []
    const m = manifest as Record<string, unknown>
    const uses: string[] = []
    if (isObject(m.properties)) {
        for (const [key, value] of Object.entries(m.properties)) {
            if (!isObject(value)) continue
            if (value.type === "connection") uses.push(`properties.${key} is a connection: an account to act as`)
            if (value.optionsFrom !== undefined) uses.push(`properties.${key}.optionsFrom reads its options as an account`)
        }
    }
    if (isObject(m.action) && m.action.connection !== undefined) uses.push("action.connection makes the call as an account")
    if (m.trigger !== undefined) uses.push("trigger watches an account")
    if (isObject(m.auth) && typeof m.auth.provider === "string" && m.auth.provider) uses.push(`auth.provider names "${m.auth.provider}"`)
    return uses
}

export function checkManifest(raw: unknown, hasCode: boolean): ManifestCheck {
    const errors: string[] = []
    const warnings: string[] = []

    if (!isObject(raw)) {
        return { ok: false, kind: hasCode ? "code" : "declared", errors: ["manifest.json must be a JSON object."], warnings }
    }
    const m = raw

    const kind: StepKind = isObject(m.trigger)
        ? "trigger"
        : isObject(m.action)
          ? isObject(m.action.request) ? "declared" : "outputs-only"
          : "code"

    for (const key of Object.keys(m)) {
        if (!KNOWN_BLOCKS.has(key)) warnings.push(`"${key}" is not something a manifest can declare, and is dropped when the step is saved.`)
    }

    // ─── Properties ─────────────────────────────────────────────────────────
    const properties = isObject(m.properties) ? m.properties : {}
    if (m.properties !== undefined && !isObject(m.properties)) errors.push("properties must be an object of fields.")
    const typeOf = (name: unknown) => (typeof name === "string" && isObject(properties[name]) ? properties[name].type : undefined)

    for (const [key, value] of Object.entries(properties)) {
        if (!isObject(value)) {
            errors.push(`properties.${key} must be an object with at least a label and a type.`)
            continue
        }
        if (typeof value.type !== "string" || !PROPERTY_TYPES.has(value.type)) {
            warnings.push(`properties.${key} has type ${JSON.stringify(value.type)}, which the platform does not know; it becomes a plain text field.`)
        }
        if (typeof value.label !== "string" || !value.label.trim()) {
            warnings.push(`properties.${key} has no label; the canvas shows "${key}" instead.`)
        }
        if ((value.type === "select" || value.type === "multiselect") && value.options === undefined && value.optionsFrom === undefined) {
            warnings.push(`properties.${key} is a ${value.type} with no options and no optionsFrom; there is nothing to choose.`)
        }
        if (value.options !== undefined) {
            const options = Array.isArray(value.options) ? value.options : null
            if (!options || options.some((o) => !isObject(o) || typeof o.label !== "string" || typeof o.value !== "string")) {
                errors.push(`properties.${key}.options must be a list of { "label": "…", "value": "…" }, both text.`)
            }
        }
        if (value.optionsFrom !== undefined) checkOptionsFrom(key, value, typeOf, errors)
    }

    // ─── Auth, ports, limits ────────────────────────────────────────────────
    if (m.auth !== undefined) {
        if (!isObject(m.auth)) errors.push("auth must be an object.")
        else {
            if (typeof m.auth.type !== "string" || !AUTH_TYPES.has(m.auth.type)) {
                errors.push(`auth.type must be one of ${[...AUTH_TYPES].join(", ")}.`)
            }
            for (const key of HOST_KEYS) {
                if (key in m.auth) errors.push(`auth.${key} is refused: a manifest may not name a host. The provider's base URL belongs to the platform.`)
            }
        }
    }
    for (const ports of ["inputs", "outputs"] as const) {
        if (m[ports] !== undefined && (!Array.isArray(m[ports]) || (m[ports] as unknown[]).some((p) => typeof p !== "string"))) {
            errors.push(`${ports} must be a list of port names.`)
        }
    }
    if (Array.isArray(m.outputs) && m.outputs.length === 0 && kind !== "trigger") {
        warnings.push("outputs is empty: no line can be drawn from this step.")
    }
    if (m.timeoutMs !== undefined) {
        if (typeof m.timeoutMs !== "number" || m.timeoutMs <= 0) errors.push("timeoutMs must be a number of milliseconds.")
        else if (m.timeoutMs > PUSH_CHECK.maxTimeoutMs) warnings.push(`timeoutMs ${m.timeoutMs} is cut to ${PUSH_CHECK.maxTimeoutMs}, the most a step is given.`)
    }
    if (typeof m.memoryLimitMb === "number" && m.memoryLimitMb > MAX_MEMORY_MB) {
        warnings.push(`memoryLimitMb ${m.memoryLimitMb} is cut to ${MAX_MEMORY_MB}.`)
    }

    // ─── Declared steps ─────────────────────────────────────────────────────
    if (m.action !== undefined) {
        if (!isObject(m.action)) errors.push("action must be an object.")
        else checkAction(m.action, properties, typeOf, errors, warnings)
        if (hasCode) errors.push("This step has both an action block and code. A step is one or the other: remove index.js, or the action block.")
    }

    // ─── Triggers ───────────────────────────────────────────────────────────
    if (m.trigger !== undefined) {
        if (!isObject(m.trigger)) errors.push("trigger must be an object.")
        else checkTrigger(m.trigger, typeOf, errors, warnings)
    }

    if (kind === "code" && !hasCode) {
        errors.push("There is no index.js and no action or trigger block, so this step has nothing to run.")
    }

    // Only VisualAutomate's own apps act as a connected account: the platform
    // refuses a developer's step that names one, and the portal will not save
    // or publish it. So each way in is an error here, not a warning.
    for (const use of accountUseIn(m)) errors.push(`${use}. ${ACCOUNTS_ARE_OURS}`)

    return { ok: errors.length === 0, kind, errors, warnings }
}

function checkConnectionName(where: string, name: unknown, typeOf: (n: unknown) => unknown, errors: string[]): void {
    if (typeof name !== "string" || !name) {
        errors.push(`${where} must name one of this step's properties of type "connection".`)
    } else if (typeOf(name) === undefined) {
        errors.push(`${where} names "${name}", which is not one of this step's properties.`)
    } else if (typeOf(name) !== "connection") {
        errors.push(`${where} names "${name}", which is a ${String(typeOf(name))} property rather than a connection.`)
    }
}

function checkAction(
    a: Record<string, unknown>,
    properties: Record<string, unknown>,
    typeOf: (n: unknown) => unknown,
    errors: string[],
    warnings: string[],
): void {
    const request = a.request
    if (request !== undefined) {
        if (!isObject(request)) {
            errors.push("action.request must be an object.")
            return
        }
        const viaConnection = a.connection !== undefined
        const viaBaseUrl = a.baseUrl !== undefined
        if (viaConnection && viaBaseUrl) errors.push("action has both connection and baseUrl: a request goes as an account or to a named host, never both.")
        if (!viaConnection && !viaBaseUrl) errors.push("action.request needs either connection (an account to act as) or baseUrl (the https:// host to call).")
        if (viaConnection) checkConnectionName("action.connection", a.connection, typeOf, errors)
        if (viaBaseUrl) {
            if (typeof a.baseUrl !== "string" || !/^https:\/\//i.test(a.baseUrl)) errors.push("action.baseUrl must start with https://.")
            else if (/\{\{\s*input\./.test(a.baseUrl)) errors.push("action.baseUrl may read the step's fields ({{config.…}}) but never {{input.…}}: what an earlier step hands on must not decide where a key is sent.")
        }
        const method = String(request.method ?? "GET").toUpperCase()
        if (!METHODS.has(method)) errors.push(`action.request.method must be one of ${[...METHODS].join(", ")}.`)
        if (!isRelativePath(request.path)) errors.push("action.request.path must be a path relative to the base URL, never a full URL.")
        if (request.bodyType !== undefined && !BODY_TYPES.has(String(request.bodyType))) {
            errors.push(`action.request.bodyType must be one of ${[...BODY_TYPES].join(", ")}.`)
        }
        if (request.body !== undefined && method === "GET") warnings.push("action.request has a body on a GET; most APIs ignore it.")
        if (viaConnection && isObject(request.headers)) {
            for (const header of Object.keys(request.headers)) {
                if (header.toLowerCase() === "authorization") warnings.push("action.request sets Authorization while acting as an account; the platform adds the account's credential itself.")
            }
        }
    }
    if (a.outputs !== undefined && !isObject(a.outputs)) errors.push("action.outputs must be an object of name to value.")
    if (a.outputs === undefined) warnings.push("action has no outputs: the step hands nothing on.")
    for (const key of ["errorPath", "okPath", "okValue"] as const) {
        if (a[key] !== undefined && typeof a[key] !== "string") errors.push(`action.${key} must be text.`)
    }
    if (a.items !== undefined) {
        if (!isObject(a.items) || typeof a.items.path !== "string") errors.push('action.items must be { "path": "…" }, with "" when the answer is the list itself.')
        else if (a.items.limit !== undefined && (typeof a.items.limit !== "number" || a.items.limit < 1 || a.items.limit > MAX_ITEM_LIMIT)) {
            errors.push(`action.items.limit must be a number from 1 to ${MAX_ITEM_LIMIT}.`)
        }
    }
    if (a.paginate !== undefined) {
        if (!isObject(a.paginate) || !PAGINATE_FROM.has(String(a.paginate.from))) {
            errors.push(`action.paginate.from must be one of ${[...PAGINATE_FROM].join(", ")}.`)
        } else if (a.paginate.maxPages !== undefined && (typeof a.paginate.maxPages !== "number" || a.paginate.maxPages > MAX_PAGES)) {
            errors.push(`action.paginate.maxPages must be at most ${MAX_PAGES}.`)
        }
        if (a.items === undefined) errors.push("action.paginate needs action.items: pages are pages of a list.")
    }
    const text = JSON.stringify({ baseUrl: a.baseUrl, request: a.request, outputs: a.outputs })
    for (const [, key] of text.matchAll(/\{\{\s*config\.([A-Za-z0-9_$]+)/g)) {
        if (!(key in properties)) warnings.push(`{{config.${key}}} names no property; it is always empty.`)
    }
}

function checkTrigger(t: Record<string, unknown>, typeOf: (n: unknown) => unknown, errors: string[], warnings: string[]): void {
    checkConnectionName("trigger.connection", t.connection, typeOf, errors)
    if (!isObject(t.request) || !isRelativePath(t.request.path)) errors.push("trigger.request.path must be a path relative to the provider.")
    else if (t.request.method !== undefined && !["GET", "POST"].includes(String(t.request.method).toUpperCase())) {
        errors.push("trigger.request.method must be GET or POST.")
    }
    if (typeof t.items !== "string") errors.push('trigger.items must be the dotted path to the list in the answer ("" when the answer is the list).')
    if (typeof t.id !== "string" || !t.id) errors.push("trigger.id must be the dotted path, within an item, to what makes it unique.")
    if (t.poll !== undefined && typeof t.poll !== "number" && (typeof t.poll !== "string" || typeOf(t.poll) === undefined)) {
        errors.push("trigger.poll must be a number of minutes, or the name of a property that holds one.")
    }
    if (t.cursor !== undefined) {
        if (!isObject(t.cursor) || !["response", "item"].includes(String(t.cursor.from)) || typeof t.cursor.path !== "string") {
            errors.push('trigger.cursor must be { "from": "response" | "item", "path": "…" }.')
        } else if (t.cursor.initial !== "now") {
            warnings.push('trigger.cursor has no "initial": "now": switching the trigger on starts a run, at the user\'s cost, for every item already there.')
        }
    }
    if (t.hydrate !== undefined && (!isObject(t.hydrate) || !isRelativePath(t.hydrate.path))) {
        errors.push("trigger.hydrate.path must be a path relative to the provider.")
    }
    if (t.maxPerPoll !== undefined && (typeof t.maxPerPoll !== "number" || t.maxPerPoll < 1)) errors.push("trigger.maxPerPoll must be a positive number.")
}

function checkOptionsFrom(
    key: string,
    property: Record<string, unknown>,
    typeOf: (n: unknown) => unknown,
    errors: string[],
): void {
    const where = `properties.${key}.optionsFrom`
    if (property.type !== "select" && property.type !== "multiselect") {
        errors.push(`${where} only means something on a select or multiselect, and ${key} is a ${String(property.type)}.`)
    }
    const o = property.optionsFrom
    if (!isObject(o)) {
        errors.push(`${where} must be an object.`)
        return
    }
    checkConnectionName(`${where}.connection`, o.connection, typeOf, errors)
    if (typeof o.label !== "string" || !o.label.trim()) errors.push(`${where}.label must say what each option shows, e.g. {{item.name}}.`)
    if (typeof o.value !== "string" || !o.value.trim()) errors.push(`${where}.value must say what choosing it stores, e.g. {{item.id}}.`)
    if (!isObject(o.request) || !isRelativePath(o.request.path)) errors.push(`${where}.request.path must be a path relative to the provider.`)
    else {
        if (o.request.method !== undefined && String(o.request.method).toUpperCase() !== "GET") errors.push(`${where}.request must be a GET: options are read whenever somebody opens the step.`)
        if (o.request.body !== undefined) errors.push(`${where}.request cannot have a body: it is a GET.`)
    }
}
