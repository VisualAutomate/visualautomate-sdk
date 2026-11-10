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
| `storage` | the account's files — `put`, `get`, `delete`, `list`, `head`, `signedUrl`, `shareUrl`, `download` |
| `state` | values that outlive one run, scoped to the workflow — `get`, `set` (at most 128 KB, `ttlSeconds` at least 60), `delete`, `list` (`{ keys: [{ key, expiresAt }], complete }`) |
| `media` | ffmpeg, by operation name. Absent when the server has no sandbox configured |
| `workflowId`, `nodeId`, `userId`, `executionId`, `startedAt`, `secrets` | about the run |

There is no connected account for your steps: only VisualAutomate's own apps act
as one (`checkManifest` refuses a `connection` property, `optionsFrom`,
`action.connection`, a `trigger` and `auth.provider`). A step reaches an API with
the key a user enters in a `secret` property.

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

Storage and state are real, in memory, with the same edge cases and limits the
platform's have — `get` on a missing key is `null`, `put` takes a string or bytes,
`list` is prefix-filtered, a state value over 128 KB or a `ttlSeconds` under 60 is
refused, and an expired value reads as `null`.

`media` is not simulated: `context.media` fails with a sentence saying so. Stub
`fetch` to test the code around an API call; asserting on what your plugin
*asked* for is a better test than any imitation of the API would be.

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

`validatePluginCode` also refuses code over 100,000 characters, as the upload does.

## Loading code the way the runner does

```ts
import { executeOf, loadPluginCode, sandboxRequire, simulate } from "@visualautomate/plugin-sdk"

const exported = loadPluginCode(code, sandboxRequire((name) => require(name)), {
    fetch: myGuardedFetch,           // optional: the step's fetch
    console: { log: (...a) => logs.push(a) },
})
const result = await simulate(executeOf(exported), { config })
```

`loadPluginCode` compiles the code into a `node:vm` context of its own, wrapped
as the platform's runner wraps it, with the platform's globals (`fetch`, `btoa`,
`TextEncoder`, `Blob`, `FormData`, the typed arrays …) and no others: `Buffer`,
`process`, `globalThis`, `structuredClone` and the Node modules are undefined,
and `console` has `log`, `error`, `warn` and `info`. `executeOf` finds the
function the runner would call: the export itself, its `execute`, or a `default`
that is a function.

Objects a step returns belong to its own context, so compare them as JSON rather
than with a deep-equality that checks prototypes.

## Checking a manifest

```ts
import { checkManifest } from "@visualautomate/plugin-sdk"

const check = checkManifest(JSON.parse(manifestText), /* has code */ true)
check.ok        // false when the portal would refuse it
check.kind      // "code" | "declared" | "outputs-only" | "trigger"
check.errors    // why it would be refused
check.warnings  // what it would drop or regret
```

The SDK's own reading of the rules the portal enforces, for code steps and
declared steps (`action`), and the refusal of anything that would act as a
connected account (`accountUseIn` lists each way in); the portal's word is final.

## The platform's facts

`PLATFORM_NODE_MAJOR`, `PROVIDED_GLOBALS`, `BLOCKED_GLOBAL_NAMES`,
`SANDBOX_TIERS`, `RETIRED_TIERS`, `STATE_LIMITS`, `SIGNED_URL_SECONDS`,
`MAX_CODE_LENGTH`, `SANDBOX_OVERRIDES` and `PUSH_CHECK` (the portal's default
`expectOutput` and time limits) are exported, generated from the platform.
