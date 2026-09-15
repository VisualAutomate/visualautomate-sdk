/**
 * Comments in manifest.json, stripped before anybody parses it.
 *
 * WHY. A manifest is the part of a plugin an author edits most and understands
 * least: which property types exist, what a trigger block looks like, what
 * `outputFields` is for. The answer to all of those is a few lines of example,
 * and the natural place for them is the file itself, commented out — the way a
 * generated config file has always taught its own format.
 *
 * JSON has no comments, and the server parses what it is sent with a strict
 * `JSON.parse`. So the file on the author's disk is JSONC and the bytes on the
 * wire are JSON: this strips the comments, `push` sends the result, and nothing
 * on the server has to learn a new format or relax a parser.
 *
 * Replacing comments with spaces rather than removing them keeps every offset
 * intact, so a syntax error further down still reports the line and column the
 * author is looking at.
 */

/**
 * The same text with `//` and block comments blanked out.
 *
 * String-aware, because `"https://example.com"` is not a comment and a naive
 * replace turns a valid manifest into a broken one — which would be a fine way
 * to make this feature worse than not having it. Escapes inside strings are
 * honoured for the same reason: `"a \" // b"` is one string.
 */
export function stripJsonComments(text: string): string {
    let out = ""
    let inString = false
    let inLine = false
    let inBlock = false

    for (let i = 0; i < text.length; i++) {
        const char = text[i]
        const next = text[i + 1]

        if (inLine) {
            if (char === "\n") {
                inLine = false
                out += char
            } else {
                out += " "
            }
            continue
        }

        if (inBlock) {
            if (char === "*" && next === "/") {
                inBlock = false
                out += "  "
                i++
            } else {
                // Newlines are kept so line numbers in a parse error still
                // point at the line the author can see.
                out += char === "\n" ? char : " "
            }
            continue
        }

        if (inString) {
            out += char
            if (char === "\\") {
                // Whatever follows is escaped, comment syntax included.
                out += text[++i] ?? ""
            } else if (char === '"') {
                inString = false
            }
            continue
        }

        if (char === '"') {
            inString = true
            out += char
            continue
        }
        if (char === "/" && next === "/") {
            inLine = true
            out += "  "
            i++
            continue
        }
        if (char === "/" && next === "*") {
            inBlock = true
            out += "  "
            i++
            continue
        }

        out += char
    }

    return out
}

/**
 * Parse a manifest that may carry comments, and hand back the strict JSON the
 * server should receive.
 *
 * Both are returned because both are wanted and deriving one from the other
 * twice is how they come to differ: `push` sends `json`, and everything that
 * reads a field reads `value`.
 */
export function parseJsonc(text: string): { value: unknown; json: string } {
    const value = JSON.parse(stripJsonComments(text))
    return { value, json: JSON.stringify(value, null, 2) }
}
