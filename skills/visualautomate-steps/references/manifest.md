# manifest.json

Declares a step: the fields the canvas draws, the ports it leaves by, what it hands on, the account it acts as, and its limits. Strict JSON on the platform (the CLI strips `//` comments in local files). Keys not listed here are dropped when the step is saved.

```json
{
  "description": "Create a task in a project",
  "icon": "check-square",
  "color": "#5e6ad2",
  "auth": { "type": "none" },
  "properties": {
    "apiKey":  { "label": "API key", "type": "secret", "required": true, "group": "Account" },
    "project": { "label": "Project", "type": "string", "required": true },
    "title":   { "label": "Title", "type": "string", "required": true },
    "priority": {
      "label": "Priority",
      "type": "select",
      "default": "normal",
      "options": [{ "label": "Normal", "value": "normal" }, { "label": "Urgent", "value": "urgent" }]
    }
  },
  "inputs": ["input"],
  "outputs": ["success", "error"],
  "outputFields": { "id": "The new task's id", "url": "A link to it" },
  "timeoutMs": 20000
}
```

## Top-level keys

| Key | Type | Notes |
| --- | --- | --- |
| `description` | string | One line, shown in the step picker. Start with a verb |
| `icon` | string | A Lucide icon name: `globe`, `database`, `mail`, `file-text`, `sparkles`, ... |
| `color` | string | Hex ring colour on the canvas |
| `version` | number | Bump when the declaration changes shape. Default 1 |
| `properties` | object | The fields. See below |
| `inputs` | string[] | Default `["input"]`. A trigger has `[]` |
| `outputs` | string[] | Ports. Default `["success", "error"]`. Each is a line a user can draw from |
| `outputFields` | object | Describes the keys of `data` for the next step's picker: `{ "id": "The new id" }`, or `{ "items": { "type": "list", "description": "..." } }` |
| `auth` | object | `{ "type": "oauth2" \| "api_key" \| "basic" \| "none", "provider"?: "...", "scopes"?: [...] }` |
| `timeoutMs` | number | Default 10000 on a canvas and 30000 in the push check, max 60000, and never more than the user's plan allows. The push check reads it here, not from the test file |
| `memoryLimitMb` | number | Default 32, max 128 |
| `action` | object | A declared step. See `declared-steps.md` |
| `trigger` | object | A trigger. See `triggers.md` |

`auth` may not contain `url`, `baseUrl`, `base_url` or `host`: refused outright.

## Properties

The key is the name in code: property `title` is `config.title`.

| Key | Notes |
| --- | --- |
| `label` | Shown above the input. Always set it, in words |
| `type` | See the table below |
| `required` | The workflow will not run while it is empty; the step shows a red dot |
| `default` | Starting value |
| `description` | Helper text under the input |
| `group` | Fields with the same group are shown together |
| `options` | For `select`/`multiselect`: `[{ "label": "Fast", "value": "fast" }]` |
| `min`, `max` | For `number` |
| `pattern` | For `string`: a regex the value must match, e.g. `"^https://"` |
| `help` | Longer help, shown on request |
| `disabled` | Shown but not editable |
| `optionsFrom` | For `select`/`multiselect`: read the options from the account, `{ "connection": "account", "request": { "path": "…" }, "items": { "path": "…" }, "label": "{{item.name}}", "value": "{{item.id}}" }`. GET only |
| `sentTo` | For `secret`: the properties that say where it is sent (a server URL); the stored key is kept only while they are unchanged |
| `verbatim` | For `secret`: sent exactly as typed, never computed with |
| `provider` | For `connection`: the provider id, e.g. `outlook`, `github`. A module inherits its app's |

### Types

| Type | Canvas | Arrives in `config` as |
| --- | --- | --- |
| `string` | text box that takes data bubbles | text, with bubbles already filled in |
| `number` | number input | number |
| `boolean` | switch | `true`/`false` |
| `select` | dropdown | the chosen `value` |
| `multiselect` | several choices | array of values |
| `json` | JSON editor | the parsed value |
| `code` | code editor | the text exactly as typed, never parsed |
| `secret` | masked input for a key the user pastes | text; masked wherever shown |
| `color` | colour picker | hex string |
| `date` | date picker | ISO date |
| `connection` | picker of the user's connected accounts | do not read it; use `context.connections.get("<name>")` |
| `file` | picker over the account's storage | the file read: `{ name, contentType, size, contentBytes }`. For a PDF attachment, never a video |
| `path` | the same picker | the path only, nothing read. What media steps take |
| `paths` | the same picker, appending | several paths, one per line |

A field the user left empty may be missing: default it in code (`config.limit ?? 10`).

## Ports

```json
"outputs": ["success", "error", "empty"]
```

Return the name of one as `output`. `success` and `error` are what users expect; an error route on the canvas catches `error`. Add a port only for a third outcome a workflow should branch on (`duplicate`, `not_found`, `high`/`medium`/`low`).

## Connections

```json
"auth": { "type": "oauth2", "provider": "outlook" },
"properties": {
  "account": { "label": "Outlook account", "type": "connection", "provider": "outlook", "required": true }
}
```

In an app, the app holds the connection; each module still declares its `connection` property (it may omit `provider`, which it inherits).
