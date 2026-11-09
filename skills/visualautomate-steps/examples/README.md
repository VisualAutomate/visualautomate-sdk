# Examples

Working steps to start from. Copy the closest one into the repository (a plugin's root, or `modules/<slug>/` in an app) and change it. For a whole app, start from `apps/`.

Every code example passes the platform's code check, and the ones that need no network, account or extra package are run with `vsa test` by this repository's tests, so they cannot quietly go stale.

| Folder | Kind | Shows |
| --- | --- | --- |
| `hello-world/` | code | The smallest working step: one property, success and error ports |
| `branching-outputs/` | code | More than two ports, so a workflow can branch per result |
| `state-dedupe/` | code | `context.state`: let each item through once, a short lock with `ttlSeconds` |
| `storage-files/` | code | `context.storage`: write, read, list, and a signed link |
| `storage-paths-media/` | code | `path`/`paths` properties and `context.media` to trim a video |
| `http-request/` | code | `fetch` with a select, a number and a JSON field; failures by the error port |
| `connection-account/` | code | A `connection` property and `context.connections`; the test checks the clean refusal without an account |
| `secrets/` | code | `context.secrets` for a key the plugin itself holds |
| `packages/` | code | `require` of allowed packages: lodash, date-fns, zod |
| `declared-api-key/` | declared | One request to an API with the user's own key: `baseUrl` and a `secret` property |
| `declared-connection-list/` | declared | A list from a connected account, with `items` and page-by-page `paginate` |
| `declared-reshape/` | declared | No request at all: outputs built from the fields with filters |
| `trigger-new-mail/` | trigger | A starting point that polls a mailbox, from now on |
| `apps/` | apps | Whole apps in the `modules/` shape: GitHub and Slack without code, Gmail and DeepL with declared and code modules side by side. See `apps/README.md` |

Declared steps and triggers have no `index.js`: `vsa test` checks their manifests, and the developer portal's editor runs them with **Try it**.

The test files here are what passes **locally**, where there is no account. To publish a step, its test must come back on `success` in a push check: for a step that acts as an account, put the id of one of your connected accounts in `config` (the module's page on the portal lists them) and set `expectOutput` to `success`.
