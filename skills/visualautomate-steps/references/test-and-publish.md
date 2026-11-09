# Testing and publishing

## The CLI

```bash
npm install -g @visualautomate/cli   # Node 20+. vsa, va and visualautomate are the same command
```

| Command | Does |
| --- | --- |
| `vsa test [<module>]` | Runs the platform's check once: code rules, the sandbox's `require`, then a run with in-memory storage and state |
| `vsa test --docker` | The same, inside the real sandbox image |
| `vsa dev [<module>]` | Runs in the sandbox image and again on every save (starts Docker, fetches the image). `--local` without Docker, `--tier standard\|boosted\|high\|max` |
| `vsa types` | Writes `visualautomate.d.ts` and `jsconfig.json` so `/** @type {PluginModule} */` gives completion |
| `vsa add:property <type> <name> [description] [default]` | Adds a field to `manifest.json` and a value to the test file. `--required`, `--label`, `--options "A:a,B:b"`, `--provider <p>`, `--module <m>` |
| `vsa init <name> --template blank\|http-request\|connection\|file` | A TypeScript playground (`plugin.ts`). Not the publishing shape |
| `vsa skill [--global]` | Installs this skill for Claude Code, and writes AGENTS.md / CLAUDE.md |

At the root of an app's repository, `vsa test` runs every folder in `modules/`; `vsa test send` runs the one whose name matches best.

Nothing in the CLI signs in or uploads. Publishing goes through GitHub and the developer portal.

## The test file: visualautomate.test.json

```json
{
  "config": { "project": "Website", "title": "Check the forms" },
  "input": {},
  "expectOutput": "success",
  "timeoutMs": 30000,
  "storage": { "notes/hello.txt": "hello from a file" },
  "state": { "runs": 0 },
  "secrets": { "API_KEY": "test-key" },
  "allowedDomains": ["api.example.com"]
}
```

| Key | Read by | Is |
| --- | --- | --- |
| `config` | push check and locally | the fields, as if filled in |
| `input` | push check and locally | what earlier steps handed on |
| `expectOutput` | push check and locally | the port the run must leave by |
| `timeoutMs` | push check and locally | the run's time limit |
| `storage` | locally | files to start with: path to text |
| `state` | locally | state to start with |
| `secrets` | locally | values for `context.secrets` |
| `allowedDomains` | locally | hosts `fetch` may reach; anything else fails, as on the platform |

A run passes when it succeeds and leaves by `expectOutput`. Invalid JSON stops the run.

Choose a test that passes **on the platform**, where no account is connected and the network is restricted:

- A step that needs a connection: test the clean refusal, `"expectOutput": "error"` with no account.
- A step that needs the user's key or a real API: test the missing-key or bad-input path, or use a public endpoint the plugin is allowed to reach.
- A pure step: test the real behaviour with realistic `input` and `config`.

`context.connections` and `context.media` are not simulated locally: `vsa test` passes the code checks, then stops with "context.connections is not available locally". That is expected. The push check on the platform runs the step without an account, so the no-account path must leave by `error`.

Output of a passing run:

```text
✓ passed  success, 3ms
output   success (expected success)
data     { "id": "t_42" }
```

## Publishing (tell the user; you cannot do it for them)

1. Push the repository to GitHub.
2. On https://developers.visualautomate.com create a **plugin**, or an **app** (name, description, PNG logo up to 2 MB, and the connection users will connect) with a **New module** per step.
3. Open **GitHub repository** and import the repository. A repository belongs to one plugin or app.
4. Every push is tested against the modules it touched; the portal shows each commit's result. Declared steps and triggers are tested in the portal editor instead (**Try it**).
5. Publish a commit that passed. **Private**: only the user, always free, usable at once. **Public**: reviewed first (editing is locked while in review), then listed in the marketplace; can be priced per run and/or per month in credits.
6. A published version is fixed. A change is a new commit, a new check and a new version.
