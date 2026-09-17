/**
 * Adding a property to a manifest without disturbing the rest of the file.
 *
 * WHY NOT parse and re-serialise. A manifest is JSONC: most of what it has to
 * say about the format is in the commented-out examples underneath, and the
 * author's own formatting is theirs. `JSON.parse` then `JSON.stringify` would
 * hand back a file with all of that gone — a property added at the cost of the
 * documentation next to it. So this is a text edit at a known offset, and the
 * file comes back as it was with one member more.
 *
 * Offsets come from the comment-stripped copy, which is why stripping replaces
 * comments with spaces instead of removing them: every offset in that copy is
 * the same offset in the file the author has open.
 */

import { stripJsonComments } from "./jsonc"

/** Every type the platform renders a field for. */
export const PROPERTY_TYPES = [
    "string",
    "number",
    "boolean",
    "select",
    "multiselect",
    "json",
    "color",
    "date",
    "connection",
    "file",
    "path",
    "paths",
] as const

export type PropertyType = (typeof PROPERTY_TYPES)[number]

export function isPropertyType(value: string): value is PropertyType {
    return (PROPERTY_TYPES as readonly string[]).includes(value)
}

/**
 * What the property is called in `config`, and so in the author's own code.
 *
 * The same shape a JavaScript identifier has, because `config.api-key` is not
 * something anybody can write and a property nobody can read is not worth
 * adding.
 */
export function isPropertyName(name: string): boolean {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
}

/** `apiKey` → `Api key`, `retry_count` → `Retry count`. Sentence case, like the examples. */
export function labelFor(name: string): string {
    const words = name
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim()
        .toLowerCase()
    return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The default as the type has it.
 *
 * A default is text on a command line and a value in the manifest, and the two
 * are not the same thing: `2` is a number, `false` is a boolean, and a
 * multiselect's default is a list. Anything that does not convert is an error
 * rather than a guess — a number property holding the string "2" is the kind of
 * thing that is discovered much later.
 */
export function defaultFor(type: PropertyType, raw: string): unknown {
    switch (type) {
        case "number": {
            const value = Number(raw)
            if (raw.trim() === "" || Number.isNaN(value)) throw new Error(`"${raw}" is not a number.`)
            return value
        }
        case "boolean": {
            const value = raw.trim().toLowerCase()
            if (["true", "yes", "1"].includes(value)) return true
            if (["false", "no", "0"].includes(value)) return false
            throw new Error(`"${raw}" is not true or false.`)
        }
        case "json":
            try {
                return JSON.parse(raw)
            } catch {
                throw new Error(`"${raw}" is not JSON. Quote it as your shell needs: '{"a":1}'`)
            }
        case "multiselect":
        case "paths":
            return raw.trim() === "" ? [] : raw.split(",").map((part) => part.trim()).filter(Boolean)
        default:
            return raw
    }
}

/** `Fast:fast,Thorough:thorough` — or `fast,thorough`, where the label is the value. */
export function optionsFrom(raw: string): Array<{ label: string; value: string }> {
    return raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const at = part.indexOf(":")
            if (at === -1) return { label: labelFor(part), value: part }
            return { label: part.slice(0, at).trim(), value: part.slice(at + 1).trim() }
        })
}

export interface PropertySpec {
    type: PropertyType
    name: string
    description?: string
    /** Absent when none was given, which is different from an empty one. */
    value?: string
    label?: string
    required?: boolean
    options?: string
    provider?: string
}

/**
 * The property itself, in the order the scaffolded manifests use it.
 *
 * Key order is not nothing here: this file is read far more often than it is
 * written, and a property that looks like the one above it is quicker to read
 * than one with the same keys in a different order.
 */
export function buildProperty(spec: PropertySpec): Record<string, unknown> {
    const property: Record<string, unknown> = {
        label: spec.label?.trim() || labelFor(spec.name),
        type: spec.type,
    }

    if (spec.type === "select" || spec.type === "multiselect") {
        const options = optionsFrom(spec.options ?? "")
        if (options.length === 0) {
            throw new Error(
                `A ${spec.type} needs its choices: --options "Fast:fast,Thorough:thorough", or --options fast,thorough.`,
            )
        }
        property.options = options
    }

    if (spec.type === "connection") {
        if (!spec.provider) {
            throw new Error('A connection needs the provider it is for: --provider outlook.')
        }
        property.provider = spec.provider
    }

    if (spec.required) property.required = true
    if (spec.value !== undefined) property.default = defaultFor(spec.type, spec.value)
    if (spec.description?.trim()) property.description = spec.description.trim()
    return property
}

interface Span {
    /** The `{` or the first character of the value. */
    start: number
    /** One past the value's last character: the `}` itself for an object. */
    end: number
}

/**
 * Where each key of the outermost object keeps its value.
 *
 * A small scanner rather than a regular expression because `"properties"` can
 * appear inside a string, inside a nested object, or inside a comment, and only
 * one of those three is the one being looked for.
 */
function topLevelMembers(bare: string): { object: Span | null; members: Map<string, Span> } {
    const members = new Map<string, Span>()
    let object: Span | null = null
    let depth = 0
    let key: string | null = null
    let expectValue = false

    for (let i = 0; i < bare.length; i++) {
        const char = bare[i]

        if (char === '"') {
            let end = i + 1
            while (end < bare.length && bare[end] !== '"') end += bare[end] === "\\" ? 2 : 1
            if (depth === 1 && !expectValue) key = bare.slice(i + 1, end)
            if (depth === 1 && expectValue && key) {
                members.set(key, { start: i, end })
                key = null
                expectValue = false
            }
            i = end
            continue
        }

        if (char === ":" && depth === 1 && key) {
            expectValue = true
            continue
        }

        if (char === "{" || char === "[") {
            depth++
            if (depth === 1) object = { start: i, end: -1 }
            if (depth === 2 && expectValue && key) {
                const close = matchBracket(bare, i)
                members.set(key, { start: i, end: close })
                key = null
                expectValue = false
                i = close
                depth--
            }
            continue
        }

        if (char === "}" || char === "]") {
            if (depth === 1 && object) object.end = i
            depth--
            continue
        }

        // A number, true, false or null: it runs to the comma or the closing brace.
        if (depth === 1 && expectValue && !/[\s,]/.test(char)) {
            let end = i
            while (end < bare.length && !/[,}\]]/.test(bare[end])) end++
            if (key) members.set(key, { start: i, end: end - 1 })
            key = null
            expectValue = false
            i = end - 1
        }
    }

    return { object, members }
}

/** The index of the bracket that closes the one at `open`. */
function matchBracket(bare: string, open: number): number {
    let depth = 0
    for (let i = open; i < bare.length; i++) {
        const char = bare[i]
        if (char === '"') {
            i++
            while (i < bare.length && bare[i] !== '"') i += bare[i] === "\\" ? 2 : 1
            continue
        }
        if (char === "{" || char === "[") depth++
        if (char === "}" || char === "]") {
            depth--
            if (depth === 0) return i
        }
    }
    throw new Error("This manifest has a bracket that is never closed.")
}

/** The file's own indent, so what is added looks like what is there. */
function indentOf(text: string): string {
    const found = /\n([ \t]+)"/.exec(text)
    return found ? found[1] : "  "
}

/** The last character of the outermost object that is not a space. */
function lastContent(bare: string, from: number, to: number): number {
    for (let i = to - 1; i > from; i--) {
        if (!/\s/.test(bare[i])) return i
    }
    return -1
}

function indented(value: unknown, indent: string, depth: number): string {
    return JSON.stringify(value, null, indent.length === 1 ? "\t" : indent.length)
        // A choice on one line, the way the scaffolded example writes it: three
        // lines each turns five options into a screenful of braces.
        .replace(/\{\s*"label": ("(?:[^"\\]|\\.)*"),\s*"value": ("(?:[^"\\]|\\.)*")\s*\}/g, '{ "label": $1, "value": $2 }')
        .split("\n")
        .map((line, index) => (index === 0 ? line : indent.repeat(depth) + line))
        .join("\n")
}

/**
 * The file with one member more, inside the object `container` names.
 *
 * Three shapes, and each of them is a file somebody has: one where the
 * container is already there, one where it exists only in a commented-out
 * example, and one with nothing in it at all. The manifest's `properties` and
 * the test file's `config` are the same problem, so they are the same code —
 * what differs is the name of the object and what goes in it.
 */
export function withMember(text: string, container: string, key: string, value: unknown): string {
    const bare = stripJsonComments(text)
    const { object, members } = topLevelMembers(bare)
    if (!object || object.end === -1) throw new Error("This file is not a JSON object.")

    const indent = indentOf(text)
    const entry = `"${key}": ${indented(value, indent, 2)}`
    const existing = members.get(container)

    let next: string
    if (existing && bare[existing.start] === "{") {
        const last = lastContent(bare, existing.start, existing.end)
        // An object the author keeps on one line stays on one line. Opening it
        // out to add a member would reformat a file nobody asked to reformat.
        const oneLine = last !== -1 && !text.slice(existing.start, existing.end).includes("\n")
        next = last === -1
            // "container": {}
            ? text.slice(0, existing.start + 1) + `\n${indent.repeat(2)}${entry}\n${indent}` + text.slice(existing.end)
            : oneLine
                ? text.slice(0, last + 1) + `, "${key}": ${JSON.stringify(value)}` + text.slice(last + 1)
                : text.slice(0, last + 1) + `,\n${indent.repeat(2)}${entry}` + text.slice(last + 1)
    } else if (existing) {
        throw new Error(`"${container}" in this file is not an object, so nothing can be added to it.`)
    } else {
        const block = `"${container}": {\n${indent.repeat(2)}${entry}\n${indent}}`
        const last = lastContent(bare, object.start, object.end)
        next = last === -1
            ? text.slice(0, object.start + 1) + `\n${indent}${block}\n` + text.slice(object.end)
            : text.slice(0, last + 1) + `,\n${indent}${block}` + text.slice(last + 1)
    }

    // What was written is read back before it is offered: a file that no longer
    // parses is worse than a property nobody added, and the author would find
    // out at push time.
    const parsed = JSON.parse(stripJsonComments(next)) as Record<string, Record<string, unknown> | undefined>
    if (!parsed[container] || !(key in parsed[container]!)) {
        throw new Error(`${key} could not be placed in this file. Add it by hand, or say where this went wrong.`)
    }
    return next
}

/** Whether the file already has that member inside that object. */
export function hasMember(text: string, container: string, key: string): boolean {
    const parsed = JSON.parse(stripJsonComments(text)) as Record<string, unknown>
    const inside = parsed[container]
    return Boolean(inside && typeof inside === "object" && !Array.isArray(inside) && key in inside)
}

/**
 * What to put in the test file for a property of this type.
 *
 * The default when there is one — it is the value the author already said is
 * sensible — and otherwise something of the right shape to edit: a test file
 * whose config holds a string where a number belongs is a run that fails for a
 * reason that has nothing to do with the plugin.
 */
export function sampleFor(property: Record<string, unknown>): unknown {
    if ("default" in property) return property.default
    switch (property.type as PropertyType) {
        case "number":
            return 0
        case "boolean":
            return false
        case "multiselect":
        case "paths":
            return []
        case "json":
            return {}
        case "select": {
            const options = property.options as Array<{ value: string }> | undefined
            return options?.[0]?.value ?? ""
        }
        default:
            return ""
    }
}
