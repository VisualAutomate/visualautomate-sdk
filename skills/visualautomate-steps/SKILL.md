---
name: visualautomate-steps
description: Build, fix or extend VisualAutomate steps (plugins, apps and their modules, triggers) end to end - manifest.json, index.js, declared action blocks, visualautomate.test.json, running `vsa test`, and getting the step published on the developer portal. Use whenever someone wants a new VisualAutomate step or integration ("make a VisualAutomate step that...", "add a module to my VisualAutomate app", "connect X to VisualAutomate"), mentions the `vsa`/`va`/`visualautomate` CLI or @visualautomate/plugin-sdk, or is working in a repository with manifest.json + index.js + visualautomate.test.json or a modules/ folder of them.
---

# Building VisualAutomate steps

VisualAutomate is a workflow automation platform: people drag **steps** onto a canvas and join them with lines. You are building one or more of those steps. Done well, the user describes what the step should do and gets back a repository that passes the platform's checks and is ready to push.

Read this file first. Open a file in `references/` when you reach the part it covers; copy from `examples/`, which are held to the platform's checks by this repository's tests.

| File | Read it when |
| --- | --- |
| `references/manifest.md` | writing any `manifest.json` |
| `references/code-steps.md` | writing `index.js`: `input`, `config`, `context`, return values |
| `references/declared-steps.md` | the step is one HTTP request, or only reshapes data |
| `references/triggers.md` | the step should *start* workflows when something new appears |
| `references/sandbox.md` | requiring an npm package, calling `fetch`, or `vsa test` refuses code |
| `references/test-and-publish.md` | writing the test file, running the CLI, handing over |
| `examples/` | before writing a step of the same kind: start from the closest one |
| `examples/apps/` | building an app with several modules: GitHub and Slack (declared only), Gmail and DeepL (declared and code mixed) |

## The workflow

### 1. Understand the step

Get these straight before writing anything. Ask only for what you cannot sensibly decide yourself, in one short message.

- **What it does**, in one sentence a user would read in the step picker: "Create an invoice in Moneybird".
- **Which service and how it is reached:**
  - an account the user connects on VisualAutomate (OAuth or a key held by the platform) → a `connection` property;
  - an API key the user pastes into the step → a `secret` property;
  - nothing external → neither.
- **The fields** a user fills in on the canvas, which are required, and sensible defaults.
- **What it hands on**: the few named values the next steps need (an id, a URL, a list and its count).
- **How it can fail**, and whether there is a third outcome worth its own port ("not found", "duplicate", "empty").

If the user names an API, read its documentation for the exact endpoint, method, body and response shape. Never guess field names of a real API.

### 2. Choose the kind of step

Pick the first one that can do the job:

1. **Declared step, no request**: only reshapes what reached it (pick, rename, count, join). An `action` block with `outputs` only.
2. **Declared step, one request**: one HTTP call built from the fields, with parts of the answer handed on. An `action` block with `request`. No code, no sandbox, one credit per run for the user, and a reviewer can read exactly what it does. Most app modules are this.
3. **Code step**: anything a single request cannot express: two calls combined, arithmetic, parsing, files, ffmpeg, npm packages, state. An `execute` function in `index.js`, run in a sandbox.
4. **Trigger**: starts a workflow for every new item somewhere (a mail, a row, an order). Always a `trigger` block in the manifest, never code that waits.

Say which you chose and why in one line when you hand over.

### 3. Choose the repository shape

| Building | Shape |
| --- | --- |
| One step that stands alone (a **plugin**) | `manifest.json`, `index.js`, `visualautomate.test.json` at the repository root |
| Several steps for one service (an **app** with **modules**) | `modules/<module-slug>/` with those three files in each folder. The app itself has no code |
| A **declared** module (an `action` block, no code) | Not published from GitHub. It is created on the developer portal (**New module → Call an API**), with its `manifest.json` pasted into the module's manifest editor. Write it as `modules/<slug>/manifest.json` all the same, check it with `vsa test`, and tell the user to paste it |

A push publishes only modules with an `index.js` that passes the push check; a declared module or a manifest-only trigger in the repository is checked by the portal and skipped. Module folder names are short kebab-case slugs: `send-message`, `list-invoices`.

In an app, decide per module: the reads and simple writes are usually declared, and only the modules that need more are code (see `examples/apps/gmail`, where sending needs code and the rest does not). Every module that acts as the account declares the same `connection` property (`account`) with the same provider and `auth`; the app's name, logo and connection are set on the portal, not in the repository.

If the user is already in a repository, follow its shape. If they ran `vsa init`, they have a TypeScript playground (`plugin.ts`); the repository shape above is what gets published.

### 4. Write the files

Start from the closest example. Then:

- `manifest.json`: see `references/manifest.md`. Every field has a `label`; required fields first; `outputFields` describes every key of `data`.
- `index.js`: see `references/code-steps.md`. CommonJS, `module.exports`, `/** @type {PluginModule} */` above it.
- `visualautomate.test.json`: see `references/test-and-publish.md`. A realistic `config` and `input` that reach `success` on the platform: publishing needs one push whose test comes back on `success`. For an account property, that means the id of a connected account in `config` (ask the user).

### 5. Check it

For a **code step**, run the platform's check and fix until it passes:

```bash
vsa test              # in the plugin's folder, or at an app's root (every module)
vsa test send-message # one module of an app
```

`vsa test` judges as the push check does: the manifest is checked, the code is loaded the way the platform's runner loads it (its globals and no others, a four-method console), the run gets manifest.json's `timeoutMs`, and it must leave by `expectOutput`, which is `success` when the test file names none.

If `vsa` is not installed: `npm install -g @visualautomate/cli` (Node 20+ for the CLI). With Docker available, `vsa test --docker` runs inside the real sandbox image on the platform's Node 24.

What a red result can mean, and what to do:

- **refused**: the code breaks a rule below. Fix the code, never the check.
- **`"x" is available in the sandbox but not installed here`**: an allowed package is missing locally. Run the `npm install --save-dev` line it prints (it is only for local runs), or skip the local run and say so.
- **`✗ manifest`**: the manifest breaks a rule the portal enforces. Fix the manifest.
- **`Cannot read properties of undefined (reading 'get')`**: the step uses `context.connections` without checking it. Locally there is no account, as on the platform when none is chosen: check for it and leave by `error` with a sentence. To prove the step works, name an account in the test file's `config` for the push check.
- **`… is not defined` / `undefined`** for `Buffer`, `process`, `structuredClone` and the like: the platform does not have them either. See `references/sandbox.md`.
- **`context.media is not available locally`**: expected for a step that uses ffmpeg; it runs on the platform.
- **a network failure**: the API needs the user's key or a host this machine cannot reach. Make sure the step fails cleanly by its `error` port, and say what you could not verify.

A **declared step** is checked by `vsa test` (`✓ checked … the manifest is sound`) but not run, here or by the push check. Fix every `✗ manifest` line, read the warnings, and check the request against the API's documentation. Then it goes to the developer portal: **New module → Call an API**, paste the `manifest.json` into the module's manifest editor (the form above it edits the same file), press **Try it** with an account, and publish there. Publishing needs a Try it that came back on `success`, on the saved version.

### 6. Hand over

Tell the user, briefly:

- what you built and which kind of step it is;
- the files, and what each field and output is;
- what `vsa test` said (or what you could not test, and why);
- the next steps, for code modules: push to GitHub; on https://developers.visualautomate.com create the plugin or app (and a **Write code** module), import the repository under **GitHub repository**, wait for the commit's check to pass **on success**, then publish. Private steps are usable at once; public ones are reviewed first.
- for declared modules: on the portal, **New module → Call an API**, paste the `manifest.json`, **Try it**, publish. They are never published from GitHub.
- if an account property has no account named in the test file: that the user must add one (the module's page lists the ids) before the step can be published.

## Hard rules

These are enforced by the platform. Breaking one means the step is refused or fails for every user.

1. **No `import`, anywhere in `index.js`**, not even in a comment or a type import. CommonJS only: `module.exports`, `require`.
2. **`require` only the allowed npm packages**, by bare name (`lodash`, not `lodash/get`), with a literal string. No `fs`, `http`, `child_process`, `os`, `path`. The list is in `references/sandbox.md`.
3. **None of the refused words**, even in comments or strings: `eval(`, `Function(`, `new Function`, `process.env`, `process.exit`, `globalThis`, `Reflect`, `Proxy`, `constructor`, `__proto__`, `require.cache`, `WebAssembly` and the others in `references/sandbox.md`. Name variables so they do not contain these as whole words (`ctorName`, not `constructor`).
4. **Never hold or read a credential for a connected account.** Use `context.connections.get("<your connection property>")` and `request({ path })`. There is no token to read.
5. **Never name a host for a connected account.** Request paths are relative to the provider. A manifest may not contain `url`, `baseUrl`, `base_url` or `host` in `auth`; a declared `action` uses either `connection` or `baseUrl`, never both, and `baseUrl` may read `config` but never `input`.
6. **No secrets in code or in the repository.** A user's own key is a `secret` property; a key the plugin itself uses on everybody's behalf comes from `context.secrets`.
7. **Return `{ output, data }`** where `output` is one of the manifest's `outputs`. Expected failures go out by `"error"` with a readable `data.error`; do not throw for them.
8. **A trigger never waits in code.** It is a `trigger` block; the platform polls. Use `"initial": "now"` on its cursor unless starting from the past is the point.
9. **Stay inside the limits**: `timeoutMs` at most 60000 (default 10000 on a canvas, 30000 in the push check), `memoryLimitMb` at most 128 (default 32), state values at most 128 KB each with `ttlSeconds` at least 60, `index.js` at most 100,000 characters.
10. **Only the platform's globals.** No `Buffer`, `process`, `globalThis`, `structuredClone`, `setImmediate`; `console` has `log`, `error`, `warn` and `info` only. End `index.js` with a newline.
11. **Export what the runner accepts**: `module.exports = { execute }`, `module.exports.execute = fn`, or a function. A `default` that is an object is not found.

## What makes a good step

- **The description is a sentence a user picks from**, starting with a verb: "Create an invoice", "List open tickets".
- **Labels are words, not keys**: "Customer email", not `customerEmail`. Add a `description` where a field needs explaining, and a `group` when there are more than five.
- **Defaults make the first run work**: a sensible `limit`, a default `select` option.
- **Outputs are flat and few**: `id`, `url`, `items` and `count` beat the whole raw response. Describe each one in `outputFields`; that is what the next step's user sees.
- **Error messages say what to do**: "Choose a project on this step." beats "Bad request".
- **Read the body as text before parsing it.** An API having a bad day answers with HTML.
- **Lists stay small**: a declared step with `items` has a `limit`; a code step that pages through results stops at a sensible maximum.
- **Logs explain, they do not dump**: `console.log("found 12 invoices")`, never a customer's record or a key.
