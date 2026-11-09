# VisualAutomate SDK

The tools for building VisualAutomate plugins, published to npm.

| Package | What it is |
|---|---|
| [`@visualautomate/plugin-sdk`](packages/plugin-sdk) | The types a plugin is written against, a local simulator, and the checks the platform applies to plugin code |
| [`@visualautomate/cli`](packages/cli) | `vsa` (also `va`, `visualautomate`): `init`, `dev`, `test`, `types`, `add:property`, `skill` |
| [`skills/visualautomate-steps`](skills/visualautomate-steps) | An AI skill: the guide Claude, Cursor and other assistants follow to build a step from a sentence |

Most plugin authors install only the CLI:

```bash
npm install -g @visualautomate/cli
vsa init my-step
cd my-step
vsa dev
```

Use the SDK directly for the types in your editor, or for `simulate` in your own test
suite:

```bash
npm install --save-dev @visualautomate/plugin-sdk
```

## Building steps with an AI assistant

`skills/visualautomate-steps` is an [agent skill](skills/visualautomate-steps/SKILL.md): the workflow
for building a step (understand it, choose a declared or a code step, write the files, run `vsa test`,
hand over), the platform's rules, references, and examples. The CLI carries it and installs it:

```bash
vsa skill            # .claude/skills/visualautomate-steps here, plus AGENTS.md and CLAUDE.md
vsa skill --global   # ~/.claude/skills/visualautomate-steps, for every project
vsa skill --dir out  # the folder anywhere, e.g. to zip and upload to Claude on the web
```

`vsa init` writes `AGENTS.md` and `CLAUDE.md` into every new project too, so Cursor, Copilot, Codex
and Claude Code know the platform's rules before they write a line.

The skill is held to the SDK by `test/skill.test.mjs`: every example passes the platform's code
check, the ones that need no network or account run with `vsa test`, and the lists in
`references/sandbox.md` (packages, refused patterns, blocked globals) are generated from the SDK.
After changing `platform-rules.ts` or `context-api.ts`, run `npm run skill:sync`.

## Development

```bash
npm install
npm run typecheck
npm test            # builds both packages, then tests the builds
npm run pack:check  # what each package would put on npm
```

Node 20 or newer: the platform sandbox runs Node 20, and the CLI runs plugin code in its own process.

`packages/plugin-sdk/src/platform-rules.ts` holds the packages a plugin may `require` and
the patterns the platform refuses on upload. It has to match the platform: when those
rules change there, update this file and release.

## Releasing

Both packages share one version and are published together.

1. Set `version` in `packages/plugin-sdk/package.json` and `packages/cli/package.json`.
   A version that is on npm can never be published again.
2. Check what goes out: `npm run pack:check`.
3. Publish, with a code from your authenticator app:

   ```bash
   npm login
   npm run release -- --otp=123456
   ```

   `release` typechecks, runs the tests and publishes both packages. If the code expires
   between the two, publish the second one on its own with a fresh code:
   `npm publish -w @visualautomate/cli --access public --otp=123456`.
4. Commit, tag `vX.Y.Z` and push, so the repository says what is on npm.

## License

MIT
