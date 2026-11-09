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

The three declared modules are created on the portal (**New module → Call an API**, paste the manifest); `send-email` is a **Write code** module, published from the repository after a push test on `success`.

`send-email` acts as a connected account, and there is none on your machine, so its test file checks the clean refusal (no recipient). That passes locally and on push, but **does not count for publishing**, which needs a push test on `success`: before publishing, put your Google account's id in `config.account`, a real recipient (yourself) in `config.to`, and `"expectOutput": "success"`. Every push then sends that mail, so keep it to yourself.
