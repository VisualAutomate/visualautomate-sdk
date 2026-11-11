# Code steps: index.js

A code step is one function, `execute(input, config, context)`, run in an isolated sandbox each time the step runs (once per item when the user makes it repeat).

```js
/** @type {PluginModule} */
module.exports = {
  execute: async (input, config, context) => {
    if (!config.project) {
      return { output: "error", data: { error: "Choose a project on this step." } }
    }

    const res = await fetch("https://api.example.com/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ project: config.project, title: config.title }),
    })

    const text = await res.text()
    let body = text
    try { body = JSON.parse(text) } catch { /* not JSON: keep the text */ }

    if (!res.ok) {
      return { output: "error", data: { error: `The API answered ${res.status}`, status: res.status, body } }
    }
    return { output: "success", data: { id: body.id, url: body.url } }
  },
}
```

Rules for the file: CommonJS, loaded as written with no build step. No `import` anywhere (comments included). `require` only allowed packages by bare name. See `sandbox.md`.

Accepted export forms: `module.exports = { execute }`, `module.exports.execute = fn`, `module.exports = fn`, or `module.exports.default = fn` (a function). A `default` that is an object with `execute` on it is **not** found by the runner.

The file is loaded in a `vm` context with the platform's globals only (see `sandbox.md`): no `Buffer`, `process`, `globalThis` or `structuredClone`, and a `console` with `log`, `error`, `warn` and `info`. End the file with a newline.

## `input`

The output data of every step on the route that led here, keyed by **step name** (and node id). Routes that meet here are merged.

```js
const invoices = input.list_invoices.invoices   // a step named "list_invoices" returned { invoices }
```

In a loop, also `input.item`, `input.index` (from 0) and `input.count`; after a loop, `input.collected` (every turn's result) and `input.count`. In a test file, `input` is given directly.

Prefer reading values from `config`: a field lets the user choose the source with a data bubble, so the step does not depend on what the previous step is called.

## `config`

The fields, by property name, with data bubbles already resolved. Types as in `manifest.md`. Empty fields may be missing: always default.

## `context`

| Member | What | Present |
| --- | --- | --- |
| `workflowId`, `nodeId`, `userId`, `executionId`, `startedAt` | facts about the run (`startedAt` is ISO) | always |
| `secrets` | values set for the plugin itself, e.g. `context.secrets.API_KEY`. Not the user's credentials | always, may be empty |
| `storage` | the account's files | always |
| `state` | values that outlive one run, per workflow | always |
| `media` | ffmpeg | only where the platform has it configured |

### `context.storage`

Paths are scoped to the account; never prefix them.

| Method | Returns |
| --- | --- |
| `put(path, data, contentType?)` | `{ url, size, contentType, uploadedAt, expiresAt }`. `data`: a string or a `Uint8Array` (`Buffer` is not available) |
| `get(path)` | `Uint8Array`, or `null` when missing |
| `delete(path)` | nothing |
| `list(prefix?)` | `{ files: [{ url, pathname, size, uploadedAt }], totalSize }` |
| `head(path)` | `{ size, contentType }` or `null` |
| `signedUrl(path, seconds?)` | the storage bucket's link, for an API that fetches the file: 60 to 3600 seconds (default 900) |
| `shareUrl(path, seconds?)` | a link on VisualAutomate's own domain, for a person: a mail, a message (default 900 seconds) |
| `download(url, path, contentType?)` | pulls a URL straight into storage. Optional: check `if (context.storage.download)` |

Decode text with `new TextDecoder().decode(bytes)`.

### `context.state`

| Method | Notes |
| --- | --- |
| `get(key)` | the value, or `null` if never set |
| `set(key, value, { ttlSeconds? })` | any JSON value, at most 128 KB. `ttlSeconds` at least 60 |
| `delete(key)` | |
| `list(prefix?)` | `{ keys: [{ key, expiresAt }], complete }`: each key with when it expires (`null` for never); `complete` is false when there were more |

For cursors, seen-ids (keep them bounded: `seen.slice(-500)`), counters, short locks. Large data goes in storage, with its path in state.

### `context.media`

```js
if (!context.media) return { output: "error", data: { error: "Media is not available here." } }
const result = await context.media.run("trim", { input: config.source, start: 0, duration: 10, output: "clips/out.mp4" })
if (!result.ok) return { output: "error", data: { error: "The trim failed", logs: result.logs } }
```

Name an operation and pass values; never build an ffmpeg command line. Operations: `probe`, `convert`, `trim`, `resize`, `framerate`, `extract-audio`, `remove-audio`, `replace-audio`, `thumbnail`, `frames`, `concat`, `watermark`, `text`, `crop`, `rotate`, `speed`, `volume`, `fade`, `gif`, `compress`, `reframe`, `subtitles`, `metadata`, `loop`. Their values match the fields of the Media steps on the canvas (`trim`: `input`, `start`, `end` or `duration`, `output`). Files are storage paths (`path`/`paths` properties). Not available locally: test only the code around it.

## Return value

```js
return { output: "success", data: { id: "t_42", url: "https://..." } }
```

- `output`: one of the manifest's `outputs`.
- `data`: a flat object; its keys are what `outputFields` describes and what the next steps read.
- Optional `metadata: { logs?: string[] }`.

Expected failure: `{ output: "error", data: { error: "<a sentence saying what to do>" } }`. Throw only for what should never happen: a thrown error fails the step with its message.

`console.log`/`warn`/`error` write to the step's log. Never log secrets or whole customer records.

## In a loop

`execute` runs once per item. Build storage paths and state keys from `input.item` or `input.index` so turns do not overwrite each other; keep per-item work small (a loop is at most 200 items).
