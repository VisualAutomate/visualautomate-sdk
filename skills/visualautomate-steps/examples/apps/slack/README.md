# Slack: an app without code, and a 200 that is a failure

Four declared modules, reached with the bot token of the user's own Slack app (`xoxb-…`), pasted into a `secret` field: only VisualAutomate's own apps act as a connected account. Like every declared module, each is created on the portal (**New module → Call an API**, paste its `manifest.json`, **Test the call** with a token) and published there, not from GitHub.

| | |
| --- | --- |
| Name | Slack |
| Connection | none: the bot token is a `secret` field on each module, with the scopes the user's Slack app was given |
| `baseUrl` | `https://slack.com/api`, with `Authorization: Bearer {{config.token}}` |

Slack answers `200` even when it refuses: `{ "ok": false, "error": "channel_not_found" }`. Every module therefore has `"okPath": "ok"` and `"errorPath": "error"`, so a refusal leaves by the `error` port instead of passing as a success with nothing in it.

| Module | Request | Notes |
| --- | --- | --- |
| `post-message` | `POST chat.postMessage` | Hands on the message's `ts`, which `add-reaction` and threads need |
| `list-channels` | `GET conversations.list` | A list, with the ids the other modules ask for |
| `add-reaction` | `POST reactions.add` | |
| `find-user-by-email` | `GET users.lookupByEmail` | |
