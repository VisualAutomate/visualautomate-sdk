# Slack: an app without code, and a 200 that is a failure

Four declared modules, generated from the platform's catalogue. Like every declared module, each is created on the portal (**New module → Call an API**, paste its `manifest.json`, **Test the call**) and published there, not from GitHub.

| | |
| --- | --- |
| Name | Slack |
| Connection | Slack, OAuth, scopes for messages, channels, users and reactions |
| Base URL (from the provider) | `https://slack.com/api` |

Slack answers `200` even when it refuses: `{ "ok": false, "error": "channel_not_found" }`. Every module therefore has `"okPath": "ok"` and `"errorPath": "error"`, so a refusal leaves by the `error` port instead of passing as a success with nothing in it.

| Module | Request | Notes |
| --- | --- | --- |
| `post-message` | `POST chat.postMessage` | Hands on the message's `ts`, which `add-reaction` and threads need |
| `list-channels` | `GET conversations.list` | A list, with the ids the other modules ask for |
| `add-reaction` | `POST reactions.add` | |
| `find-user-by-email` | `GET users.lookupByEmail` | |
