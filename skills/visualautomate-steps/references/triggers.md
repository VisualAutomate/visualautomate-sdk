# Triggers

A trigger starts a workflow for each new item somewhere: a mail, a row, an order. It is **never code that waits**: a sandbox bills by the second. It is a `trigger` block in the manifest; the platform's scheduler polls the provider without starting a machine, and starts one run per new item, with the item as the step's output. A trigger has no `index.js`, `inputs: []`, and usually `outputs: ["success"]`.

`vsa test` checks it (and warns when `"initial": "now"` is missing) but does not run it. A push publishes only modules with an `index.js` that passes the push check, so a manifest-only trigger cannot be published from GitHub. Ask the user how their app is meant to add one before building it.

## Example: Outlook's "New email", as it ships

```json
{
  "description": "Starts the workflow when new mail arrives",
  "auth": { "type": "oauth2", "provider": "outlook" },
  "properties": {
    "account": { "label": "Outlook account", "type": "connection", "required": true },
    "poll_minutes": {
      "label": "Double-check every",
      "type": "select",
      "default": 30,
      "options": [{ "label": "Every 30 minutes", "value": "30" }, { "label": "Every hour", "value": "60" }]
    }
  },
  "inputs": [],
  "outputs": ["success"],
  "outputFields": { "subject": "The subject line", "from": "Who sent it" },
  "trigger": {
    "connection": "account",
    "poll": "poll_minutes",
    "push": { "resource": "/me/mailFolders('inbox')/messages", "changeType": "created", "maxMinutes": 4230 },
    "request": {
      "path": "/v1.0/me/mailFolders/inbox/messages",
      "query": { "$filter": "receivedDateTime gt {{cursor}}", "$orderby": "receivedDateTime asc", "$top": "25" }
    },
    "items": "value",
    "id": "id",
    "cursor": { "from": "item", "path": "receivedDateTime", "as": "value", "initial": "now" },
    "maxPerPoll": 10
  }
}
```

## Keys

| Key | Notes |
| --- | --- |
| `connection` | Required. Name of your `connection` property: the account to watch |
| `request` | `{ method?: "GET" \| "POST", path, query?, headers?, body? }`. `path` relative to the provider |
| `items` | Dotted path to the list in the answer (`value`, `data`, `messages`). Empty when the answer is the list |
| `id` | Dotted path within an item to what makes it unique. Seen ids never start a second run |
| `poll` | Minutes between checks: a number, or the name of a property so the user picks it. Default 5; the user's plan sets the minimum |
| `cursor` | Where the next poll continues: `{ from: "response" \| "item", path, as: "url" \| "value", initial?: "now" }` |
| `hydrate` | A second request per item, when the list returns only ids: `{ path: ".../messages/{{id}}", query? }`. The result replaces the item |
| `push` | For providers that notify (Microsoft Graph): `{ resource, changeType, maxMinutes? }`. Still polled underneath as a safety net |
| `maxPerPoll` | Items one poll may start runs for. Default 25; the rest wait for the next poll |

### cursor

- `from: "response"` reads it from the envelope (a delta link); `from: "item"` from the newest item (a timestamp, a history id).
- `as: "url"`: the value is the next request outright (delta links carry their own query). `as: "value"`: it is substituted wherever `{{cursor}}` appears in `request`.
- `initial: "now"`: the first poll only marks the position and starts nothing. **Use it** unless starting from the past is the point: without it, switching the trigger on starts one run, and costs the user credits, for every item already there.

## Checklist

- The provider's list endpoint sorts oldest first, or the cursor reads the newest item correctly.
- `id` is stable and unique per item.
- `initial: "now"` is set.
- `maxPerPoll` is modest (10 to 25).
- `outputFields` describes the item's useful fields, since the item is what the next steps read.
