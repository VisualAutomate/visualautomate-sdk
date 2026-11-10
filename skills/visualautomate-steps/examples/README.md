# Examples

Working steps to start from. Copy the closest one into the repository (a plugin's root, or `modules/<slug>/` in an app) and change it. For a whole app, start from `apps/`.

Every code example passes the platform's code check, and the ones that need no network or extra package are run with `vsa test` by this repository's tests, so they cannot quietly go stale. None uses a connected account: only VisualAutomate's own apps act as one.

| Folder | Kind | Shows |
| --- | --- | --- |
| `hello-world/` | code | The smallest working step: one property, success and error ports |
| `branching-outputs/` | code | More than two ports, so a workflow can branch per result |
| `state-dedupe/` | code | `context.state`: let each item through once, a short lock with `ttlSeconds` |
| `storage-files/` | code | `context.storage`: write, read, list, and a signed link |
| `storage-paths-media/` | code | `path`/`paths` properties and `context.media` to trim a video |
| `http-request/` | code | `fetch` with a select, a number and a JSON field; failures by the error port |
| `secrets/` | code | `context.secrets` for a key the plugin itself holds |
| `packages/` | code | `require` of allowed packages: lodash, date-fns, zod |
| `declared-api-key/` | declared | One request to an API with the user's own key: `baseUrl` and a `secret` property |
| `declared-reshape/` | declared | No request at all: outputs built from the fields with filters |
| `apps/` | apps | Whole apps in the `modules/` shape: GitHub and Slack without code, DeepL with declared and code modules side by side. See `apps/README.md` |

Declared steps have no `index.js`: `vsa test` checks their manifests. A declared step is published from the developer portal, not GitHub: **New module → Call an API**, paste its `manifest.json`, **Test the call**, publish.

The test files here are what passes **locally**. To publish a step, its test must come back on `success` in a push check; a real key never goes in a committed test file (see `apps/deepl`).
