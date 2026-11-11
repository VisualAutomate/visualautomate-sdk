# manifest.json

Declares a step: the fields the canvas draws, the ports it leaves by, what it hands on, and its limits. Strict JSON on the platform (the CLI strips `//` comments in local files). Keys not listed here are dropped when the step is saved.

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
| `inputs` | string[] | Default `["input"]` |
| `outputs` | string[] | Ports. Default `["success", "error"]`. Each is a line a user can draw from |
| `outputFields` | object | Describes the keys of `data` for the next step's picker: `{ "id": "The new id" }`, or `{ "items": { "type": "list", "description": "..." } }` |
| `auth` | object | `{ "type": "none" }`, or leave it out. The other types (`oauth2`, `api_key`, `basic`) name a provider to sign in to, which only VisualAutomate's own apps do. A user's key goes in a `secret` property |
| `timeoutMs` | number | Default 10000 on a canvas and 30000 in the push check, max 60000, and never more than the user's plan allows. The push check reads it here, not from the test file |
| `memoryLimitMb` | number | Default 32, max 128 |
| `action` | object | A declared step. See `declared-steps.md` |

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
| `sentTo` | For `secret`: the properties that say where it is sent (a server URL); the stored key is kept only while they are unchanged |
| `verbatim` | For `secret`: sent exactly as typed, never computed with |

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
| `file` | picker over the account's storage | the file read: `{ name, contentType, size, contentBytes }`. For a PDF attachment, never a video |
| `path` | the same picker | the path only, nothing read. What media steps take |
| `paths` | the same picker, appending | several paths, one per line |

A field the user left empty may be missing: default it in code (`config.limit ?? 10`).

## Ports

```json
"outputs": ["success", "error", "empty"]
```

Return the name of one as `output`. `success` and `error` are what users expect; an error route on the canvas catches `error`. Add a port only for a third outcome a workflow should branch on (`duplicate`, `not_found`, `high`/`medium`/`low`).

## No accounts

Only VisualAutomate's own apps act as somebody's connected account. A step built here has no `connection` property, `optionsFrom`, `action.connection`, `trigger` or `auth.provider`, and `vsa test` refuses each of them. It reaches an API at its own address, with the user's key in a `secret` property:

```json
"auth": { "type": "none" },
"properties": {
  "apiKey": { "label": "API key", "type": "secret", "required": true, "description": "Each user enters their own" }
}
```

A declared step sends it in a header (`"Authorization": "Bearer {{config.apiKey}}"`, see `declared-steps.md`); code reads `config.apiKey`.
