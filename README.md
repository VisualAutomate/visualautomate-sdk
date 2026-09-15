# VisualAutomate SDK

The tools for building VisualAutomate plugins, published to npm.

| Package | What it is |
|---|---|
| [`@visualautomate/plugin-sdk`](packages/plugin-sdk) | The types a plugin is written against, a local simulator, and the checks the platform applies to plugin code |
| [`@visualautomate/cli`](packages/cli) | `visualautomate` / `va`: `init`, `test`, `dev`, `push`, `login` |

Most plugin authors install only the CLI:

```bash
npm install -g @visualautomate/cli
va init my-step
cd my-step
va dev
```

Use the SDK directly for the types in your editor, or for `simulate` in your own test
suite:

```bash
npm install --save-dev @visualautomate/plugin-sdk
```

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
