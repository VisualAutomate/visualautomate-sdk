# Gmail: a mixed app

Reading and labelling mail is one request each, so those modules are declared (generated from the platform's catalogue). Sending is not: Gmail takes the whole message as an RFC 2822 text, base64url-encoded, in one `raw` field. A declaration can fill in a JSON body but cannot encode one, so `send-email` is code.

| | |
| --- | --- |
| Name | Gmail |
| Connection | Google (`google-mail`), OAuth, scope `gmail.modify` |
| Base URL (from the provider) | `https://gmail.googleapis.com` |

| Module | Kind | Notes |
| --- | --- | --- |
| `search-messages` | declared | Gmail's own search syntax in `q` |
| `get-message` | declared | Headers, snippet and parts of one message |
| `modify-labels` | declared | Archive, mark read, add or remove labels |
| `send-email` | code | Builds the MIME message with `js-base64` (an allowed package), sends it with `context.connections` |

`send-email` cannot run on your machine, because it acts as a connected account: `vsa test` passes its code checks and then says the account is not available locally. Its test file checks the clean refusal (no recipient), which is also what the platform's push check runs.
