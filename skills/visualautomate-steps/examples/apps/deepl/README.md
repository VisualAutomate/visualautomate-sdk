# DeepL: an app with an API key, and a module that needs code

DeepL is reached with a key the user pastes, not an account the platform connects, so every module has a `secret` property for the key and names the host itself with `baseUrl`. The host depends on the user's plan, so `baseUrl` reads a field: `https://{{config.host}}/v2`. (`baseUrl` may read `config`, never `input`.)

| | |
| --- | --- |
| Name | DeepL |
| Connection | none: the key is a field on each module |
| Hosts to allow for the code module | `api-free.deepl.com`, `api.deepl.com` |

| Module | Kind | Notes |
| --- | --- | --- |
| `translate-text` | declared | `POST translate`, the key in an `Authorization: DeepL-Auth-Key …` header, `{{response.translations.0.text}}` reads the first result |
| `list-languages` | declared | The answer is a bare list, so `items.path` is `""` |
| `usage` | declared | |
| `translate-long-text` | code | One request takes at most 50 texts, so a long document is several requests stitched back together in order |

The declared modules are created on the portal (**New module → Call an API**, paste the manifest, **Test the call** with your key). `translate-long-text` is published from the repository; its push test needs a key, which belongs in `context.secrets` set for the plugin, never in a committed test file.

Optional body fields are left out on purpose: a declared body sends a blank field as `""`, which DeepL refuses. Empty `query` values are dropped, body values are not.

`translate-long-text` runs on your machine without a key: its test checks the refusal when no key is filled in. With a real key, add `"apiKey"` to `config` and `"allowedDomains": ["api-free.deepl.com"]` locally, and never commit the key.
