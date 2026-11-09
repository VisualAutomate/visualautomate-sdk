# Declared steps: the `action` block

One HTTP request described in the manifest, made by the platform. No `index.js`, no sandbox, one credit per run for the user, and reviewable at a glance. Use it whenever a step is a single call (or no call at all). It cannot transform: no base64, no combining two calls, no arithmetic. That needs code.

**Where it lives.** A declared module is not published from GitHub: a push publishes only code. It is created on the developer portal with **New module → Call an API**, and its `manifest.json` is edited on the module's action page, as a form or as JSON (both edit the same file). So write the manifest, keep a copy in the repository if you like (`modules/<slug>/manifest.json`), check it with `vsa test`, and paste it into the portal.

`vsa test` checks the manifest (connection or `baseUrl`, a relative path, `https://`, no `{{input}}` in `baseUrl`, items and pages) but does not run it. The action page runs it with **Try it**, against an account the user picks. Publishing needs a passing Try it, on the success port, on the saved version. `$map` and `$if` cannot be edited in the form; paste them in the JSON.

## Shape

```json
"action": {
  "connection": "account",
  "request": {
    "method": "POST",
    "path": "v1.0/me/sendMail",
    "query": {},
    "headers": {},
    "body": {
      "message": {
        "subject": "{{config.subject}}",
        "body": {
          "contentType": { "$if": "{{config.isHtml}}", "then": "HTML", "else": "Text" },
          "content": "{{config.body}}"
        },
        "toRecipients": { "$map": "{{config.to | list}}", "to": { "emailAddress": { "address": "{{item}}" } } }
      }
    }
  },
  "errorPath": "error.message",
  "outputs": { "sent": true, "to": "{{config.to | list}}", "statusCode": "{{status}}" }
}
```

| Key | Notes |
| --- | --- |
| `connection` | Name of your `connection` property. The request goes as that account, under the provider's base URL |
| `baseUrl` | For an API without a connection: `"https://api.example.com/v1"`. `https://` only. May use `{{config.…}}`, never `{{input.…}}`. Exactly one of `connection`/`baseUrl` when there is a request |
| `request.method` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `request.path` | Relative to the base URL. Never a full URL |
| `request.query`, `request.headers`, `request.body` | Values may contain tokens |
| `request.bodyType` | `json` (default), `form` (urlencoded, nested as `a[b]=c`: Stripe, Twilio), `multipart` (a `file` property becomes a file part) |
| `outputs` | What the step hands on. Literals stay literal (`"sent": true` is a boolean) |
| `errorPath` | Where the provider puts its refusal reason, e.g. `error.message`. Absent: the whole body |
| `okPath` / `okValue` | For APIs that answer 200 to a failure. `"okPath": "ok"` (Slack); `"okPath": "status", "okValue": "OK"` (Google Places) |
| `items` | `{ "path": "data", "limit": 50 }`: the answer is a list at `path`; each item goes through `outputs` reading `{{item.…}}`, and the step hands on `{ items, count }`. `limit` default 100, max 1000 |
| `paginate` | See below |

Leave out `request` for a step that only reshapes its fields:

```json
"action": { "outputs": { "recipients": "{{config.to | list}}", "howMany": "{{config.to | length}}" } }
```

## Tokens

| Token | Is |
| --- | --- |
| `{{config.x}}` | a field |
| `{{input.step_name.field}}` | data from an earlier step |
| `{{response.a.b}}` | the answer (in `outputs`) |
| `{{status}}` | HTTP status |
| `{{item}}`, `{{item.id}}` | the current item in `$map` or with `items` |
| `{{cursor}}` | the next page's cursor, with `paginate` |

A string that is exactly one token keeps its type (`"{{config.isHtml}}"` sends a boolean). Text around a token makes it a string.

**Empty values:** a `query` parameter that resolves to nothing (empty, `null`, missing) is left out of the request. A `body` field is sent as it resolves, so a field the user left blank can arrive as `""`. So put optional values in `query` where the API allows it; for an optional body field that an API refuses when empty, leave the field out of the step, or write code. Dotted paths try a key containing dots first, so `{{response.@odata.nextLink}}` works.

Filters after a bar: `list` (value or comma-separated text to a list), `length`, `first`, `last`, `upper`, `lower`, `trim`, `number`, `json`.

Operators: `{ "$map": "<list token>", "to": <template using {{item}}> }` builds one entry per item; `{ "$if": "<token>", "then": a, "else": b }` picks by truthiness.

## An API with the user's own key

```json
{
  "description": "Get the current weather for a city",
  "auth": { "type": "none" },
  "properties": {
    "apiKey": { "label": "API key", "type": "secret", "required": true },
    "city": { "label": "City", "type": "string", "required": true }
  },
  "outputs": ["success", "error"],
  "outputFields": { "temperature": "Degrees Celsius", "summary": "In words" },
  "action": {
    "baseUrl": "https://api.example.com/v1",
    "request": {
      "method": "GET",
      "path": "weather",
      "query": { "q": "{{config.city}}" },
      "headers": { "Authorization": "Bearer {{config.apiKey}}" }
    },
    "errorPath": "error.message",
    "outputs": { "temperature": "{{response.current.temp}}", "summary": "{{response.current.summary}}" }
  }
}
```

## Pagination

```json
"request": { "method": "GET", "path": "v1/customers", "query": { "limit": "100", "starting_after": "{{cursor}}" } },
"items": { "path": "data", "limit": 500 },
"paginate": { "from": "item", "path": "id", "more": "has_more" }
```

| `from` | Next page from |
| --- | --- |
| `response` | a value in the answer (`response_metadata.next_cursor`, `paging.next.after`). With `"as": "url"` a next link becomes the next request (`@odata.nextLink`) |
| `item` | a value on the last item (Stripe `id` for `starting_after`) |
| `page` | a page number from `start` |
| `offset` | items so far |

Stops at `limit`, an empty page, `more` false, no next value, or `maxPages` (default 10, max 50).

## Checklist (nothing runs it for you)

- The JSON parses, and every `{{config.x}}` names a property that exists.
- `connection` names a property of type `connection`; or `baseUrl` is `https://` and reads no `input`.
- `path` is relative; no Authorization header for a connection.
- `outputs` covers every key in `outputFields`, and `errorPath`/`okPath` match the provider's documented error shape.
- Lists have `items` with a `limit`.
