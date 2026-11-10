# Testing and publishing

## The CLI

```bash
npm install -g @visualautomate/cli   # vsa, va and visualautomate are the same command
```

The CLI runs on Node 20 or newer; steps run on the platform's Node 24, which `vsa dev` and `vsa test --docker` use.

| Command | Does |
| --- | --- |
| `vsa test [<module>]` | The push check, here: the manifest is checked; a code step's code is checked with the upload's rules, loaded the way the runner loads it, and run. A declared step or a trigger is checked, not run |
| `vsa test --docker` | The same, inside the sandbox image, on Node 24 |
| `vsa dev [<module>]` | Runs in the sandbox image and again on every save. `--local` without Docker, `--tier standard\|boosted\|high` |
| `vsa types` | Writes `visualautomate.d.ts` and `jsconfig.json` so `/** @type {PluginModule} */` gives completion |
| `vsa add:property <type> <name> [description] [default]` | Adds a field to `manifest.json` and a value to the test file. `--required`, `--label`, `--options "A:a,B:b"`, `--provider <p>`, `--module <m>` |
| `vsa init <name> --template blank\|http-request\|connection\|file` | A TypeScript playground (`plugin.ts`). Not the publishing shape |
| `vsa skill [--global]` | Installs this skill for Claude Code, and writes AGENTS.md / CLAUDE.md |

At the root of an app's repository, `vsa test` runs every folder in `modules/`, code or not; `vsa test send` runs the one whose name matches best.

Nothing in the CLI signs in or uploads. Publishing goes through GitHub and the developer portal.

## The test file: visualautomate.test.json

```json
{
  "config": { "account": "<connection id>", "project": "Website", "title": "Check the forms" },
  "input": {},
  "expectOutput": "success",
  "storage": { "notes/hello.txt": "hello from a file" },
  "state": { "runs": 0 },
  "secrets": { "API_KEY": "test-key" },
  "allowedDomains": ["api.example.com"]
}
```

| Key | Read by | Is |
| --- | --- | --- |
| `config` | push check and `vsa test` | The fields, as if filled in. For an account property, the **id of one of the developer's connected accounts**: the push check then acts as that account |
| `input` | push check and `vsa test` | What earlier steps handed on |
| `expectOutput` | push check and `vsa test` | The port the run must leave by. **Default `success`** when it is left out |
| `storage`, `state`, `secrets` | `vsa test` only | Files, state and `context.secrets` to start with |
| `allowedDomains` | `vsa test` only | Hosts `fetch` may reach; anything else fails, as on the platform |

The run's time limit is **`timeoutMs` in manifest.json** (30000 when it names none, at most 60000). The push check does not read a `timeoutMs` in the test file, and `vsa test` warns about one.

A run passes when it succeeds and leaves by `expectOutput`. Invalid JSON stops the run.

## Publishing needs a run on success

The portal refuses to publish code that has not passed a push test **on the `success` port**: once, on that exact code, within the last 30 days. A test that expects `error` and gets it passes the check, but proves nothing, and publishing stays refused. So every code step needs a test file that reaches `success` on the platform:

- **A step that acts as an account:** put the account's id in `config`, under the connection property's name (`"account": "…"`). The ids are listed on the module's page in the developer portal; ask the user for one. The push check then makes real calls as that account **on every push**, so choose a test that is safe to repeat: a read, a draft, a message to a test channel.
- **A step that needs the user's key:** a `secret` field in `config` would be committed to the repository, so never put a real key there. Use a key the plugin holds in `context.secrets`, a public endpoint the plugin may reach, or ask the user how they want to prove it.
- **A pure step:** realistic `input` and `config`, `expectOutput` `success`.

Locally there is no account: `context.connections` is absent, as on the platform when no account is chosen, and `vsa test` says when an account property has none named for the push check. `context.media` is not available locally.

A **declared step** is not published from GitHub. It is created on the portal with **New module → Call an API**, its `manifest.json` pasted into the module's editor, and it needs a passing **Test the call** on its saved version, on the success port, before it can be published there.

Output of a passing run:

```text
✓ passed  success, 3ms
output   success (expected success, the default)
data     { "id": "t_42" }
```

## Publishing (tell the user; you cannot do it for them)

1. Push the repository to GitHub.
2. On https://developers.visualautomate.com create a **plugin**, or an **app** (name, description, PNG logo up to 2 MB, and the connection users will connect) with a **New module** per step: **Write code** for a code module, **Call an API** for a declared one.
3. Open **GitHub repository** and import the repository. A repository belongs to one plugin or app.
4. Every push is tested against the code modules it touched; the portal shows each commit's result. Declared modules are pasted into their action page, tested there with **Test the call**, and published there.
5. Publish a commit whose test came back on `success`. **Private**: only the user, always free. **Public**: reviewed first (editing is locked while in review), then listed in the marketplace; can be priced per run and/or per month in credits.
6. A published version is fixed. A change is a new commit, a new check and a new version.
