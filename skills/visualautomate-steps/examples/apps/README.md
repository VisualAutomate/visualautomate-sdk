# App examples

An **app** is several steps (its **modules**) for one service, under one name. In a repository it is one folder per module under `modules/`:

```text
my-app/
  modules/
    create-issue/
      manifest.json             a declared module: no index.js
    translate-long-text/
      manifest.json
      index.js                  a code module
      visualautomate.test.json
```

The app itself has no file: its name, description and logo are set on the developer portal. It connects no account: only VisualAutomate's own apps act as one. So every module asks for the service's key or token the same way, a `secret` property with the same name, and names the API's host itself.

**Code modules** are published from the repository: a push tests them, and a commit that passed on `success` is published. **Declared modules** are kept here as `manifest.json` so `vsa test` can check them, but they are published from the portal: **New module → Call an API**, paste the manifest into the module's editor, **Test the call**, publish.

| App | Modules | Reached with | Shows |
| --- | --- | --- | --- |
| `github/` | 4 declared | a personal access token the user pastes | An app without code: create, list, update and comment |
| `slack/` | 4 declared | a bot token the user pastes | An API that answers 200 to a failure, caught with `okPath` |
| `deepl/` | 3 declared, 1 code | none: an API key the user pastes | `baseUrl` that reads a field, a `secret` key in a header, and code for many calls stitched together |

Choose per module, not per app: a module is declared when one request does the job, and code when it needs more.
