# Upstream

This skill is Cloudflare's `security-audit` skill, copied unchanged from
https://github.com/cloudflare/security-audit-skill (directory
`skills/security-audit`, commit `c1c8a8c`). It is MIT-licensed; see `LICENSE`.

## Using it

In Claude Code, from the root of this repository:

- `security audit this codebase` runs the full six-phase audit. It spawns many
  agents, so start with a scope or a profile, for example
  `security audit this codebase, quick profile` or
  `security audit app/api with the quick profile`.
- A narrower question (`review the share-link route for security issues`)
  uses the skill as guidance only and writes no report files.

A full audit writes its report outside the repository, by default to
`~/security-audit-skill/<repo-name>/run-<N>/`.

## Updating it

Copy `skills/security-audit/` from a newer commit of the upstream repository
over this directory, keep this file and `LICENSE`, and update the commit above.
Do not edit the other files here: they are upstream's, and an edit would be
lost on the next update.
