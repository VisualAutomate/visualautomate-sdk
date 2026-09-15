/**
 * What `visualautomate init` writes.
 *
 * DATA, NOT FILES. Templates that are strings in the binary cannot go missing
 * from a published tarball.
 *
 * There are four, and the number is deliberate. Eleven half-written starting
 * points is not a richer choice, it is eleven things to keep true as the
 * runtime moves; these four are the shapes a real plugin actually takes -- do
 * something with what you were given, call an API you hold a key for, call an
 * API on somebody's connected account, and work on a file. Each is complete,
 * runs unmodified with `visualautomate test`, and uses the API it is
 * demonstrating rather than describing it in a comment.
 */

export interface Template {
    description: string
    /** One of the platform's five categories. */
    category: string
    code: string
    /**
     * The manifest as it is written to disk -- JSONC, not an object.
     *
     * Text rather than a structure because most of what is worth saying about a
     * manifest is said in a commented-out example, and a structure cannot hold
     * a comment. `push` strips them before sending; see src/jsonc.ts.
     */
    manifest: string
    /** What `test.json` starts as, so `test` does something on the first run. */
    testInput: Record<string, unknown>
}

/**
 * The rest of the declaration, commented out, in every scaffolded manifest.
 *
 * A manifest is the part of a plugin an author edits most and knows least: it
 * is not obvious that `select` exists, what `outputFields` is for, or what
 * turns a plugin into a trigger. Answering that in the file itself is how
 * generated config files have always taught their own format, and it beats a
 * documentation page nobody has open while they are editing.
 *
 * Written once and appended to all four, because four copies would be four
 * things to keep correct as the manifest format changes.
 */
const EXAMPLES = `
  // -- The rest of what you can declare --------------------------------
  //
  // All commented out. Uncomment what you need -- the CLI strips these before
  // it sends the manifest, so the file stays readable and the server still
  // receives strict JSON.
  //
  // PROPERTY TYPES: string, number, boolean, select, multiselect, json,
  // color, date, connection, file, path, paths.
  //
  //   "properties": {
  //     "mode": {
  //       "label": "Mode",
  //       "type": "select",
  //       "required": true,
  //       "default": "fast",
  //       "options": [
  //         { "label": "Fast", "value": "fast" },
  //         { "label": "Thorough", "value": "thorough" }
  //       ]
  //     },
  //     "retries":    { "label": "Retries", "type": "number", "min": 0, "max": 5, "default": 2 },
  //     "account":    { "label": "Account", "type": "connection", "provider": "outlook", "required": true },
  //     "attachment": { "label": "Attachment", "type": "file", "description": "Read into config before the step runs -- right for a PDF" },
  //     "clip":       { "label": "Clip", "type": "path", "description": "Named, not read. What an ffmpeg step takes." },
  //     "advanced":   { "label": "Raw options", "type": "json", "group": "Advanced" }
  //   },
  //
  // OUTPUT FIELDS are what the next step picks from a dropdown. Without them
  // somebody downstream has to guess your field names.
  //
  //   "outputFields": { "id": "The id the provider gave it" },
  //
  // PORTS. Every name here is a line somebody can draw from on the canvas.
  // Return one of them as the "output" of your step.
  //
  //   "outputs": ["success", "error", "empty"],
  //
  // HOW LONG one run may take. Capped by the account's plan, so asking for
  // more than the plan allows gets you the plan's number rather than an error.
  //
  //   "timeoutMs": 60000,
  //
  // A TRIGGER makes this a starting point: the platform polls for you and
  // starts the workflow once per new item, so nothing is billed for waiting.
  // "connection" must name one of your own properties of type "connection".
  //
  //   "trigger": {
  //     "connection": "account",
  //     "poll": 5,
  //     "request": { "method": "GET", "path": "/me/messages", "query": { "$top": "25" } },
  //     "items": "value",
  //     "id": "id",
  //     "cursor": { "from": "response", "path": "@odata.deltaLink" },
  //     "hydrate": { "path": "/me/messages/{id}" }
  //   }
`

/**
 * A manifest file: the part that is switched on, then the examples.
 *
 * No comma is added before the examples, and that is not an oversight -- what
 * follows is only comments, so after stripping there is nothing there at all. A
 * comma would leave a trailing one and the server would refuse the whole
 * declaration, which is a poor reward for reading the examples.
 */
function manifestFile(active: Record<string, unknown>): string {
    const body = JSON.stringify(active, null, 2)
    return body.slice(0, body.lastIndexOf("}")) + EXAMPLES + "}\n"
}

const blank: Template = {
    description: "A step that reshapes what reached it.",
    category: "utility",
    code: `import type { PluginModule } from "./visualautomate"

/**
 * A step that takes what the steps before it produced and hands on something
 * new. No network, no account, no file — the most common step there is.
 */
const plugin: PluginModule = {
    async execute(input, config, context) {
        const name = (config.name as string) || "world"

        // Anything you log shows up in the run's log panel.
        console.log(\`greeting \${name}\`)

        // \`output\` names which port the run leaves by, and has to be one of the
        // \`outputs\` in manifest.json. \`data\` is what the next steps can read as
        // {{this_step.field}}.
        return {
            output: "success",
            data: {
                greeting: \`Hello, \${name}!\`,
                at: context.startedAt,
            },
        }
    },
}

export default plugin
`,
    manifest: manifestFile({
        description: "Say hello",
        icon: "sparkles",
        auth: { type: "none" },
        properties: {
            name: { label: "Name", type: "string", required: false, description: "Who to greet" },
        },
        inputs: ["input"],
        outputs: ["success", "error"],
        outputFields: {
            greeting: "The greeting that was built",
            at: "When the run started",
        },
    }),
    testInput: { config: { name: "VisualAutomate" } },
}

const httpRequest: Template = {
    description: "Call an API with a key the user pastes in.",
    category: "utility",
    code: `import type { PluginModule } from "./visualautomate"

/**
 * A step that calls an API the user holds their own key for.
 *
 * The key is a \`password\` property, so it is filled in on the canvas and never
 * lives in this code. If you are integrating a provider the platform already
 * connects to, use the "connection" template instead — then nobody pastes a key
 * at all.
 */
const plugin: PluginModule = {
    async execute(input, config) {
        const url = config.url as string
        const apiKey = config.apiKey as string

        if (!url) {
            return { output: "error", data: { error: "No URL was set on this step." } }
        }

        const response = await fetch(url, {
            headers: apiKey ? { Authorization: \`Bearer \${apiKey}\` } : {},
        })

        // A provider saying no is not a crash. Leaving by the error port lets
        // somebody draw a line from it and handle the case on the canvas.
        if (!response.ok) {
            return {
                output: "error",
                data: { error: \`The request failed with status \${response.status}\`, status: response.status },
            }
        }

        // Not response.json(). An API that is having a bad day answers with an
        // HTML error page and a 200, and a plugin that assumes otherwise fails
        // with "Unexpected token '<'" — which tells nobody anything.
        const text = await response.text()
        let body: unknown = text
        try {
            body = JSON.parse(text)
        } catch {
            return {
                output: "error",
                data: { error: "The reply was not JSON.", status: response.status, body: text.slice(0, 500) },
            }
        }

        return { output: "success", data: { body, status: response.status } }
    },
}

export default plugin
`,
    manifest: manifestFile({
        description: "Fetch JSON from an API",
        icon: "globe",
        auth: { type: "none" },
        properties: {
            url: { label: "URL", type: "string", required: true, description: "The endpoint to call" },
            apiKey: {
                label: "API key",
                type: "string",
                required: false,
                description: "Sent as a Bearer token, if the API needs one",
            },
        },
        inputs: ["input"],
        outputs: ["success", "error"],
        outputFields: {
            body: "The parsed JSON the API returned",
            status: "The HTTP status code",
        },
    }),
    testInput: { config: { url: "https://api.github.com/repos/nodejs/node" } },
}

const connection: Template = {
    description: "Act on an account the user already connected.",
    category: "integration",
    code: `import type { PluginModule } from "./visualautomate"

/**
 * A step that acts as one of the user's connected accounts.
 *
 * You never see a token and you never name a host. You name a path, and the
 * platform attaches the credential on the way past — which is what stops a
 * plugin pointing somebody's account at an address of its own choosing.
 *
 * \`connections.get\` takes the name of one of YOUR properties ("account"
 * below), not a connection id, so this step can only reach the account it was
 * configured with.
 */
const plugin: PluginModule = {
    async execute(input, config, context) {
        if (!context.connections) {
            return { output: "error", data: { error: "No account is connected to this step." } }
        }

        const account = await context.connections.get("account")

        const response = await account.request({
            method: "GET",
            path: (config.path as string) || "/me/messages",
            query: { $top: String(config.limit ?? 10) },
        })

        if (!response.ok) {
            return {
                output: "error",
                data: { error: \`The provider answered \${response.status}\`, status: response.status },
            }
        }

        const body = response.body as { value?: unknown[] }
        return {
            output: "success",
            data: { items: body.value ?? [], count: (body.value ?? []).length },
        }
    },
}

export default plugin
`,
    manifest: manifestFile({
        description: "Read from a connected account",
        icon: "link",
        auth: { type: "oauth2", provider: "outlook" },
        properties: {
            account: {
                label: "Account",
                type: "connection",
                provider: "outlook",
                required: true,
                description: "The account this step acts as",
            },
            path: {
                label: "Path",
                type: "string",
                required: false,
                default: "/me/messages",
                description: "Relative to the provider's base URL. Never a full URL.",
            },
            limit: { label: "How many", type: "number", required: false, default: 10, min: 1, max: 100 },
        },
        inputs: ["input"],
        outputs: ["success", "error"],
        outputFields: {
            items: "What the provider returned",
            count: "How many items came back",
        },
    }),
    testInput: {
        config: { path: "/me/messages", limit: 2 },
        // context.connections cannot be simulated honestly, so `test` refuses
        // it. Stub it in a test of your own to exercise the code around it.
    },
}

const file: Template = {
    description: "Work on a file in the account's storage.",
    category: "utility",
    code: `import type { PluginModule } from "./visualautomate"

/**
 * A step that reads a file the account already has and writes another.
 *
 * \`path\` properties give the user a picker over their own storage, so nobody
 * types a filename and hopes. Storage is scoped to the account: you cannot name
 * anybody else's file, and you do not prefix your own.
 */
const plugin: PluginModule = {
    async execute(input, config, context) {
        const source = config.source as string
        const bytes = await context.storage.get(source)

        if (!bytes) {
            return { output: "error", data: { error: \`There is no file at \${source}.\` } }
        }

        const text = new TextDecoder().decode(bytes)
        const upper = text.toUpperCase()

        const target = (config.target as string) || source.replace(/(\\.[^.]+)?$/, "-shouted$1")
        const written = await context.storage.put(target, upper, "text/plain")

        // Remembered between runs. Useful for a cursor or a last-seen id; this
        // one just counts.
        const runs = ((await context.state.get("runs")) as number) ?? 0
        await context.state.set("runs", runs + 1)

        return {
            output: "success",
            data: { path: target, size: written.size, runs: runs + 1 },
        }
    },
}

export default plugin
`,
    manifest: manifestFile({
        description: "Shout a text file",
        icon: "file-text",
        auth: { type: "none" },
        properties: {
            source: { label: "File", type: "path", required: true, description: "A file already in your storage" },
            target: {
                label: "Save as",
                type: "string",
                required: false,
                description: "Where to write the result. Defaults to the source with -shouted added.",
            },
        },
        inputs: ["input"],
        outputs: ["success", "error"],
        outputFields: {
            path: "Where the result was written",
            size: "How large it is, in bytes",
            runs: "How many times this workflow has run this step",
        },
    }),
    testInput: {
        config: { source: "notes/hello.txt" },
        // `test` starts with these already in storage and in state, so the step
        // has something to read on its very first run.
        storage: { "notes/hello.txt": "hello from a file" },
        state: { runs: 0 },
    },
}

export const TEMPLATES = {
    blank,
    "http-request": httpRequest,
    connection,
    file,
} satisfies Record<string, Template>

export type TemplateName = keyof typeof TEMPLATES
