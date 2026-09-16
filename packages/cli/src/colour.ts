/**
 * Colour, when the terminal wants it.
 *
 * A run says one thing above all — it passed, or it did not — and a wall of one
 * grey makes that the hardest line to find. Green and red carry it, yellow
 * warns, and everything else stays dim so the result stands out.
 *
 * WHEN IT IS OFF. `NO_COLOR` set to anything at all, or output that is not a
 * terminal — a file, a pipe, a CI log — because escape codes there are noise
 * somebody has to read around. `FORCE_COLOR` turns it back on, which is what
 * `--docker` passes into the container: inside it, stdout is a pipe to Docker,
 * and without that the sandbox would print in grey while the same run on this
 * machine prints in colour.
 *
 * Colour is never the only signal: every line that is green or red also says
 * "passed" or "failed" in words.
 */

const CODES = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
} as const;

function wanted(): boolean {
    const env = process.env
    if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false
    if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "" && env.FORCE_COLOR !== "0") return true
    return Boolean(process.stdout.isTTY)
}

/** Decided once: a run does not change terminal halfway through. */
const ON = wanted()

export const colourEnabled = ON

function paint(code: string): (text: string) => string {
    return (text) => (ON ? `${code}${text}${CODES.reset}` : text)
}

export const red = paint(CODES.red)
export const green = paint(CODES.green)
export const yellow = paint(CODES.yellow)
export const blue = paint(CODES.blue)
export const dim = paint(CODES.dim)
export const bold = paint(CODES.bold)

/** What `--docker` hands the container, so it prints the way this terminal does. */
export function colourEnv(): string[] {
    return ON ? ["--env", "FORCE_COLOR=1"] : ["--env", "NO_COLOR=1"]
}
