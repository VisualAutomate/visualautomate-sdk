# App examples

An **app** is several steps (its **modules**) for one service, under one name and one connection. In a repository it is one folder per module under `modules/`:

```text
my-app/
  modules/
    create-issue/
      manifest.json             a declared module: no index.js
    send-email/
      manifest.json
      index.js                  a code module
      visualautomate.test.json
```

The app itself has no file: its name, description, logo and **connection** (what a user connects when they add the app: an OAuth sign-in, or a key) are set on the developer portal. Every module that acts as the account declares the same `connection` property, here always called `account`.

**Code modules** are published from the repository: a push tests them, and a commit that passed on `success` is published. **Declared modules** are kept here as `manifest.json` so `vsa test` can check them, but they are published from the portal: **New module → Call an API**, paste the manifest into the module's editor, **Test the call**, publish.

| App | Modules | Connection | Shows |
| --- | --- | --- | --- |
| `github/` | 4 declared | GitHub, OAuth | An app without code: create, list, update and comment, as the platform's own catalogue ships them |
| `slack/` | 4 declared | Slack, OAuth | An API that answers 200 to a failure, caught with `okPath` |
| `gmail/` | 3 declared, 1 code | Google, OAuth | A mixed app: reads are declared; sending needs code to build a base64url MIME message |
| `deepl/` | 3 declared, 1 code | none: an API key the user pastes | `baseUrl` that reads a field, a `secret` key in a header, and code for many calls stitched together |

Choose per module, not per app: a module is declared when one request does the job, and code when it needs more.
