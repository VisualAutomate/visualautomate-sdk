/**
 * Load a step's code the way the platform's runner does.
 *
 * The runner does not evaluate a step in its own process. It compiles the code
 * into a `vm` context of its own, hands it a fixed set of globals (fetch, URL,
 * the encoders, timers, crypto, the typed arrays, Blob, FormData and a few
 * more), sets a longer list to undefined (Buffer, process, globalThis,
 * SharedArrayBuffer, WeakRef, the Node modules by name) and gives it a console
 * with four methods. Everything else a step reaches for is the context's own
 * language objects.
 *
 * Loading code with `new Function` instead, in this process, gave a step all of
 * Node: `Buffer.from(…)`, `structuredClone`, `process.version`, `console.debug`
 * all worked on a laptop and were undefined on the platform. A test that
 * passes here has to fail there for a reason worth looking for, not for that.
 *
 * The lists come from the platform's runner (see platform-rules.ts, which
 * scripts/sync-platform.mjs writes), so they cannot be remembered wrongly.
 *
 * Not a security boundary: this runs your own code on your own machine. The
 * platform's boundary is the container, one per run.
 */
import vm from "node:vm"

import { BLOCKED_GLOBAL_NAMES, PROVIDED_GLOBALS } from "./platform-rules"

/** The console a step has: these four methods, and no others. */
export interface PluginConsole {
    log(...args: unknown[]): void
    error(...args: unknown[]): void
    warn(...args: unknown[]): void
    info(...args: unknown[]): void
}

export interface LoadOptions {
    /**
     * The `fetch` the step gets. Pass a guarded one to apply an egress rule;
     * without it, this process's own.
     */
    fetch?: typeof fetch
    /** Where the step's console output goes. Defaults to this process's console. */
    console?: Partial<PluginConsole>
    /** How long the code's top level may take to run, in milliseconds. */
    timeoutMs?: number
}

/** A console with exactly the platform's four methods, writing where `target` says. */
export function pluginConsole(target: Partial<PluginConsole> = console): PluginConsole {
    const forward =
        (level: keyof PluginConsole) =>
        (...args: unknown[]) => {
            const write = target[level] ?? target.log ?? console.log
            write.apply(target, args)
        }
    return { log: forward("log"), error: forward("error"), warn: forward("warn"), info: forward("info") }
}

/**
 * The globals a step's context starts with: the platform's list, taken from
 * this process where the platform takes them from its own, and the blocked
 * names set to undefined.
 */
export function sandboxGlobals(options: LoadOptions = {}): Record<string, unknown> {
    const host = globalThis as unknown as Record<string, unknown>
    const globals: Record<string, unknown> = {}
    for (const name of PROVIDED_GLOBALS) {
        if (name === "require") continue
        if (name === "console") globals.console = pluginConsole(options.console)
        else if (name === "fetch") globals.fetch = options.fetch ?? host.fetch
        else globals[name] = host[name]
    }
    for (const name of BLOCKED_GLOBAL_NAMES) globals[name] = undefined
    return globals
}

/**
 * Evaluate a step's code as the runner does, and return what it exported.
 *
 * The code is wrapped exactly as the runner wraps it, on one line with nothing
 * added after it, so a file the platform cannot load fails to load here too:
 * a last line that is a `//` comment with no newline after it comments out the
 * wrapper's closing bracket on the platform, and does here.
 */
export function loadPluginCode(code: string, require: (name: string) => unknown, options: LoadOptions = {}): unknown {
    const sandbox = sandboxGlobals(options)
    Object.defineProperty(sandbox, "constructor", { value: undefined, writable: false, configurable: false })
    const wrapped =
        '(function(module, exports, context, require) { "use strict"; var console = context.console; ' + code + " })"
    const script = new vm.Script(wrapped, { filename: "plugin.js" })
    const context = vm.createContext(sandbox, { name: "plugin-sandbox" })
    const fn = script.runInContext(context, { timeout: options.timeoutMs ?? 10_000 }) as (
        module: { exports: unknown },
        exports: unknown,
        context: Record<string, unknown>,
        require: (name: string) => unknown,
    ) => void
    const moduleObject: { exports: unknown } = { exports: {} }
    fn(moduleObject, moduleObject.exports, { ...sandbox }, require)
    return moduleObject.exports
}

/**
 * The function the runner calls, from what the code exported: the export
 * itself if it is a function, else its `execute`, else its `default` if that is
 * a function. `null` when there is none, which the runner reports as "Plugin
 * must export an execute function".
 */
export function executeOf(exported: unknown): ((...args: unknown[]) => unknown) | null {
    if (typeof exported === "function") return exported as (...args: unknown[]) => unknown
    const object = exported as { execute?: unknown; default?: unknown } | null | undefined
    if (object && typeof object.execute === "function") return object.execute as (...args: unknown[]) => unknown
    if (object && typeof object.default === "function") return object.default as (...args: unknown[]) => unknown
    return null
}
