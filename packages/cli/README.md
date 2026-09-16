# @visualautomate/cli

Build and publish VisualAutomate plugins.

```bash
npm install -g @visualautomate/cli
vsa login
vsa init my-step
cd my-step
vsa dev                 # the sandbox, and a run again on every save
vsa push
```

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
```

Templates: `blank`, `http-request`, `connection`, `file`. Pass one with
`--template`. Each runs unmodified.

## `test`

Runs your plugin the way the platform would, in three steps:

1. **The platform's code checks.** The same rules the upload applies: only
   allowed packages in `require`, no dynamic `require`, none of the refused
   patterns (`eval`, `process.env`, `import`, …). Code that fails here would be
   refused on push, and says why.
2. **The sandbox's `require`.** A step gets the allowed npm packages and nothing
   else — no `fs`, no `http`. Those packages are installed in the sandbox; here
   they come from your project, and a missing one prints the `npm install`
   command for the version the sandbox has.
3. **A context that behaves.** `storage` and `state` are real, in memory, and
   the result shows what the step left behind:

```
✓ passed  success, 3ms
output   success (expected success)
data     { "path": "notes/hello-shouted.txt", "size": 17 }
files    notes/hello.txt, notes/hello-shouted.txt
state    {"runs":1}
```

A run passes when it succeeds and, if the test file names an `expectOutput`,
leaves by that port — the same verdict as the GitHub check.

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

`context.connections` and `context.media` are **not** simulated. One is
somebody's OAuth account and the other is an ffmpeg container; pretending to be
either would produce a plugin that passes here and fails on a canvas. Asking for
one fails with a sentence saying so.

`visualautomate.test.json` (or `test.json`, or `--input <file>`) seeds the run:

```json
{
  "config": { "source": "notes/hello.txt" },
  "input": {},
  "storage": { "notes/hello.txt": "hello from a file" },
  "state": { "runs": 0 },
  "expectOutput": "success",
  "timeoutMs": 30000,
  "allowedDomains": ["api.example.com"]
}
```

The platform's push check reads `config`, `input`, `expectOutput` and
`timeoutMs`; `storage`, `state`, `secrets` and `allowedDomains` are for running
locally. A file that is not valid JSON stops the run rather than running with
nothing.

## Where `fetch` may go

On the platform a step may contact the domains its plugin declares, plus any
host in the configuration filled in for that step. A declared domain covers its
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

- the Node version the platform runs plugins on, with every allowed npm
  package installed — no `npm install` needed;
- the CPU and memory of the sandbox tier: `standard` (¼ vCPU, 1 GB, the
  default), `boosted` (½ vCPU, 4 GB), `high` (1 vCPU, 6 GB), `max` (2 vCPU, 8 GB);
- no Linux capabilities, a read-only filesystem apart from your project and a
  small `/tmp`, and nothing else from your machine.

A step that runs out of memory or time here does the same on the platform.

Docker does not have to be running: `dev` starts Docker Desktop and waits for it,
then fetches the image if this machine does not have it. `--image` uses a
different image, for example one you built yourself. The watcher stays on your
machine, and each run starts a fresh container.

`context.media` is not available locally, in or out of Docker.

## `push`

Bundles the same code `test` ran, strips the comments out of `manifest.json`,
and publishes. A version snapshot is saved, so you can roll back from the
dashboard.

Comments in `manifest.json` are a convenience of this tool: the file on your
disk may have them, the bytes on the wire never do.

## CI

There is no browser on a build machine, so `login` is not available there. Set
`VISUALAUTOMATE_API_TOKEN` instead — the same token `login` would have stored,
which you can read out of `~/.visualautomate/config.json`.

`VISUALAUTOMATE_API_URL` points the CLI at a different installation.

## Where things are

The runtime API your plugin is written against is documented in the types
(`visualautomate.d.ts` in your project, `@visualautomate/plugin-sdk` if you
prefer to install it) and on the platform's own docs page.
