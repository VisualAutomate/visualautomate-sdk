/**
 * @visualautomate/plugin-sdk
 *
 * Three things: the types a plugin is written against, a way to run one on
 * your own machine before it goes anywhere near a canvas, and the checks the
 * platform applies to a plugin's code before it will accept it.
 *
 * Nothing here runs inside the sandbox. Plugin code is plain JavaScript that
 * the platform loads; this package exists so an editor can tell you what
 * `context` has on it, and so `visualautomate test` can call your execute with
 * a context that behaves like the real one.
 */

export * from "./types"
export * from "./simulate"
export * from "./validate"
export { CONTEXT_API, BLOCKED_GLOBALS, type ContextApiEntry } from "./context-api"
