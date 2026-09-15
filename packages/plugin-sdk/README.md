# @visualautomate/plugin-sdk

The types a VisualAutomate plugin is written against, and a way to run one on
your own machine.

Most people do not need to install this. `@visualautomate/cli` carries it and
writes the types into your project, so a scaffolded plugin has no dependencies
at all. Install it directly if you want the simulator in your own test suite.

```bash
npm install --save-dev @visualautomate/plugin-sdk
```

## A plugin

```ts
import type { PluginModule } from "@visualautomate/plugin-sdk"

const plugin: PluginModule = {
    async execute(input, config, context) {
        const bytes = await context.storage.get(config.path as string)
        if (!bytes) return { output: "error", data: { error: "No such file." } }

        return {
            output: "success",
            data: { size: bytes.length },
        }
    },
}

export default plugin
```

`output` names which port the run leaves by, and has to be one of the `outputs`
in your manifest. `data` is what the next steps read.

## What `context` has

| | |
|---|---|
| `storage` | the account's files — `put`, `get`, `delete`, `list`, `head`, `signedUrl`, `download` |
| `state` | values that outlive one run, scoped to the workflow — `get`, `set`, `delete`, `list` |
| `media` | ffmpeg, by operation name. Absent when the server has no sandbox configured |
| `connections` | the accounts this step was configured with. Absent when it declares none |
| `workflowId`, `nodeId`, `userId`, `executionId`, `startedAt`, `secrets` | about the run |

You never see a credential and you never name a host. `connections.get("account")`
takes the name of one of *your* properties, and the platform attaches the token
on the way past — which is what stops a plugin pointing somebody's account
somewhere it chose.

## `simulate`

```ts
import { simulate } from "@visualautomate/plugin-sdk"
import plugin from "./plugin"

const result = await simulate(plugin, {
    config: { path: "notes/a.txt" },
    storage: { "notes/a.txt": "hello" },
    state: { runs: 0 },
})

result.status        // "success" | "error" | "timeout" | ...
result.output?.data
result.files         // what storage holds now
result.state         // what state holds now
```

Storage and state are real, in memory, with the same edge cases the platform's
have — `get` on a missing key is `null`, `put` takes a string or bytes, `list`
is prefix-filtered.

`connections` and `media` are not simulated. Pass a stub if you want to test the
code around them:

```ts
await simulate(plugin, {
    connections: {
        async get() {
            return { id: "test", async request() { return { ok: true, status: 200, body: {} } } }
        },
    },
})
```

Asserting on what your plugin *asked* the provider for is a better test than any
imitation of the provider would be.

## The platform's code checks

The rules the platform applies to a plugin's code on upload, so a test can
refuse what the platform would refuse:

```ts
import { validatePluginCode, ALLOWED_PACKAGES } from "@visualautomate/plugin-sdk"

const check = validatePluginCode(code)
if (!check.valid) throw new Error(check.error)
check.packages // the allowed packages this code requires
```

`ALLOWED_PACKAGES` lists every npm package a plugin may `require`, with the
version the sandbox has installed. Nothing else is available: no `fs`, no
`http`, and no subpaths like `lodash/get`.

`sandboxRequire(load)` and `loadPluginCode(code, require)` load code the way
the sandbox does, as the body of a function given `module`, `exports` and a
`require` that only hands out allowed packages. `visualautomate test` uses
them; they are here for your own test runner.
