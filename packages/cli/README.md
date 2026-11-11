# @visualautomate/cli

Build and test VisualAutomate plugins.

```bash
npm install -g @visualautomate/cli
vsa init my-step
cd my-step
vsa dev                 # the sandbox, and a run again on every save
```

Nothing here signs in. Your plugin reaches the platform through its GitHub
repository: push a commit, the tests run there, and Publish on the portal takes
it from the commit that passed.

`va` and `visualautomate` are the same command.

That is the whole toolchain. There is nothing else to install: the CLI carries
the SDK inside it, compiles your TypeScript itself, and writes the type
declarations into the project. A plugin directory has no `node_modules`, no
build step and no dependencies.

## What `init` gives you

```
plugin.ts            your code
manifest.json        what the canvas shows, with the rest of the options
                     written out as commented examples
plugin.json          name, version, description, category
test.json            the input, config, storage and state `test` runs with
visualautomate.d.ts  the types, written in rather than installed
tsconfig.json        so your editor type-checks it
AGENTS.md, CLAUDE.md the platform's rules, for an AI assistant working here
```

Templates: `blank`, `http-request`, `file`. Pass one with
`--template`. Each runs unmodified.

## Types in your editor

Your plugin's code imports nothing — the platform refuses the word `import`
anywhere in the file, comments included, and the SDK is not a package a step may
require. So the types are written into your project instead, and one line names
them:

```js
/** @type {PluginModule} */
module.exports = {
  execute: async (input, config, context) => {
    //                              ^ completes, with the documentation
  },
}
```

`dev` and `test` write `visualautomate.d.ts` and a `jsconfig.json` beside your
code and keep them current; `vsa types` does it on its own. In an app's
repository they go at the root, where they cover every module. Nothing is
installed, nothing of it exists while your plugin runs, and a file you wrote
yourself is never written over — delete ours and it comes back.

## `skill`

The guide an AI assistant reads to build steps for you: describe a step in a sentence ("a step that
creates an invoice in Moneybird") and the assistant writes the manifest, the code and the test file,
runs `vsa test`, and tells you how to publish it.

```bash
vsa skill            # .claude/skills/visualautomate-steps in this project, plus AGENTS.md and CLAUDE.md
vsa skill --global   # ~/.claude/skills/visualautomate-steps, for every project
vsa skill --dir out  # the skill's folder anywhere, e.g. to zip and upload to Claude on the web
```

Claude Code finds the skill on its own. `AGENTS.md` is read by Cursor, Copilot, Codex and others;
`CLAUDE.md` is one line that pulls it in for Claude Code. Both carry the platform's rules: no `import`,
only allowed packages, never a credential, `{ output, data }`. `vsa init` writes them into every new
project as well.

Running it again brings the files up to date with this CLI. An `AGENTS.md` or `CLAUDE.md` you wrote
yourself is never written over: ours starts with a marker line, and a file without it is left alone.

## `add:property`

A field on the node — what somebody fills in when they drop your module into a
workflow — written into `manifest.json`:

```bash
vsa add:property string apiKey "The key to call with"
vsa add:property number retries "How many times to try again" 2 --required
vsa add:property select mode "Which way round" fast --options "Fast:fast,Thorough:thorough"
```

`<type> <name> [description] [default]`, where the name is what your code reads:
`config.apiKey`. The label is made from the name unless `--label` says otherwise,
and the default is stored as its type has it, so `2` is a number and `false` is a
boolean.

Types: `string`, `number`, `boolean`, `select`, `multiselect`, `json`, `code`,
`secret`, `color`, `date`, `file`, `path`, `paths`. A `select` or `multiselect` needs
`--options`. There is no `connection`: only VisualAutomate's own apps act as a connected account.

The same field is added to `visualautomate.test.json` under `config`, with its
default or a value of the right shape, so the next `vsa test` passes something
for it instead of nothing. A value you have already put there is kept.

At the root of an app's repository, `--module <name>` says which one — the same
short names `test` and `dev` take. The manifest is edited where it stands: your
comments, the examples underneath and your own formatting stay as they are.

## `test`

The developer portal's check on a push, run here. In order:

0. **The manifest.** The rules the portal is known to refuse, and warnings for
   what it would drop: an `auth` that names a host, a `baseUrl` that is not
   `https://`, a request path that is a full URL. And anything that would act as
   a connected account -- a `connection` property, `optionsFrom`,
   `action.connection`, a `trigger`, `auth.provider` -- which only VisualAutomate's
   own apps may do. A declared step (an `action` block) stops here, checked: the
   platform does not run it on a push either. A declared step is published from the portal, not GitHub: New
   module → Call an API, paste its manifest.json, Test the call, publish.
1. **The platform's code checks.** The same rules the upload applies: only
   allowed packages in `require`, no dynamic `require`, none of the refused
   patterns (`eval`, `process.env`, `import`, …). Code that fails here would be
   refused on push, and says why.
2. **The sandbox's `require`.** A step gets the allowed npm packages and nothing
   else — no `fs`, no `http`. Those packages are installed in the sandbox; here
   they come from your project, and a missing one prints the `npm install`
   command for the version the sandbox has.
3. **The runner's way of loading code.** In a `vm` context of its own, with the
   platform's globals and no others: `fetch`, `btoa`, `TextEncoder`, `Blob`,
   `FormData` and the rest, but no `Buffer`, `process`, `globalThis` or
   `structuredClone`, and a `console` with `log`, `error`, `warn` and `info`. A
   step that leans on something Node has and the platform does not fails here.
4. **A context that behaves.** `storage` and `state` are real, in memory, with
   the store's limits (a value at most 128 KB, `ttlSeconds` at least 60), and
   the result shows what the step left behind:

```
✓ passed  success, 3ms
output   success (expected success, the default)
data     { "path": "notes/hello-shouted.txt", "size": 17 }
files    notes/hello.txt, notes/hello-shouted.txt
state    {"runs":1}
```

A run passes when it succeeds and leaves by the test file's `expectOutput`, or by
`success` when it names none, within manifest.json's `timeoutMs` (30 seconds when
it names none): the same verdict as the GitHub check.

**Publishing needs a run on success.** The portal publishes only code whose push
test came back on `success`. A test that expects `error` passes, and `vsa test`
says it does not count. For a step that acts as an account, name one of your
connected accounts in the test file's `config`, under the property's name: the
push check then acts as it. The module's page on the portal lists the ids.

`vsa test` runs on this machine's Node and says so when that is not the
platform's (Node 24); `vsa test --docker` and `vsa dev` run on the platform's.

The verdict is green when it passed and red when it did not, in the sandbox as
well as out here. `NO_COLOR` turns that off, and output that is not a terminal —
a pipe, a file, a CI log — is plain anyway; `FORCE_COLOR` turns it back on.

### In a GitHub repository

`test` works wherever the platform tests your code on a push:

```
my-plugin/                    a plugin's repository
  manifest.json
  index.js
  visualautomate.test.json

my-app/                       an app's repository
  modules/
    send-message/
      manifest.json
      index.js
      visualautomate.test.json
    list-channels/
      …
```

At the root of an app's repository every module runs, one after another. Name one
to run only that: `vsa test send-message`, or any short name that picks it out —
`vsa test send`. `--module <name>` is the same thing. `index.js` in a repository is run as written,
unbundled, because that is the file the sandbox loads.

## `dev`

```bash
vsa dev                    # every module in modules/
vsa dev send-message       # one of them; the shortest name that picks it will do
vsa dev --tier boosted     # a bigger machine
vsa dev --local            # on this machine's Node, without the sandbox
```

Everything in one command: it starts Docker if it is not running, fetches the
sandbox image the first time, runs every module, and runs them again on every
save. Only the module whose folder changed runs again; a change anywhere else
runs them all. Ctrl+C stops it.

`context.media` is **not** simulated: it is an ffmpeg container, and pretending
to be one would produce a plugin that passes here and fails on a canvas. It fails
with a sentence saying so. There is no `context.connections` for your steps: only
VisualAutomate's own apps act as a connected account.

`visualautomate.test.json` (or `test.json`, or `--input <file>`) seeds the run:

```json
{
  "config": { "source": "notes/hello.txt" },
  "input": {},
  "storage": { "notes/hello.txt": "hello from a file" },
  "state": { "runs": 0 },
  "expectOutput": "success",
  "allowedDomains": ["api.example.com"]
}
```

The platform's push check reads `config`, `input` and `expectOutput`; `storage`,
`state`, `secrets` and `allowedDomains` are for running locally. The time limit
is manifest.json's `timeoutMs`, not the test file's: `vsa test` warns about a
`timeoutMs` here, because the push check ignores it. A file that is not valid JSON stops the run rather than running with
nothing.

## Where `fetch` may go

On the platform a step may contact the hosts allowed for its plugin, which are
set on the platform rather than declared in the manifest, plus any host in the
configuration filled in for that step. A declared domain covers its
subdomains; localhost, private networks and metadata addresses are never
allowed.

Put the domains in `allowedDomains` and `test` applies the same rule: a request
anywhere else fails. Without `allowedDomains` nothing is blocked, but every host
the platform would refuse is listed after the run.

## `--persist`

Keeps storage and state between runs, in `.visualautomate/` next to the plugin:

```
.visualautomate/storage/<path>   files the step wrote
.visualautomate/state.json       the workflow state
```

Once that folder exists it is used without the flag. Delete it to start over,
and add it to `.gitignore`.

## The sandbox on your machine

`dev` uses it by default; `test` does with `--docker`:

```bash
vsa dev
vsa test --docker
vsa dev --tier boosted
```

Your plugin runs inside the plugin sandbox image,
`ghcr.io/visualautomate/plugin-sandbox`, at the version of this CLI:

- Node 24, the version the platform runs plugins on, with every allowed npm
  package installed at the platform's versions — no `npm install` needed;
- the CPU and memory of the platform's machine: `standard` (½ vCPU, 4 GB, the
  default), `boosted` (1 vCPU, 6 GB) or `high` (2 vCPU, 8 GB). `max` is no longer
  offered and runs as `high`, as on the platform;
- no Linux capabilities, a read-only filesystem apart from your project and a
  small `/tmp`, and nothing else from your machine.

A step that runs out of memory or time here does the same on the platform.

Docker does not have to be running: `dev` starts Docker Desktop and waits for it,
then fetches the image if this machine does not have it. `--image` uses a
different image, for example one you built yourself. The watcher stays on your
machine, and each run starts a fresh container.

`context.media` is not available locally, in or out of Docker.

## Publishing

Not from here. Connect the repository to your app on the portal, push your
commit, and the platform runs the same checks `vsa test` runs against every
module it touched. Publish on the portal takes the code from a commit whose test
came back on `success`, and a version snapshot is saved so you can roll back. A
declared step is published once Test the call in the portal's editor has passed
on its saved version.

Comments in `manifest.json` are a convenience of this tool: the file on your
disk may have them, and they are stripped before the manifest is read.

## Where things are

The runtime API your plugin is written against is documented in the types
(`visualautomate.d.ts` in your project, `@visualautomate/plugin-sdk` if you
prefer to install it) and on the platform's own docs page.
