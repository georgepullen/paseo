---
name: npm-stage-publish
description: Automate the full npm staging and publish workflow — first-publish (direct npm publish with 2FA), stage-publish (CI workflow via npm stage publish), and staged-version verification (not just 0.0.0-stage placeholder)
---

# npm stage & publish automation

This skill automates the npm staging and publish workflow for Paseo plugin
packages. It covers the two publish paths, the verification step, and the
common failure modes.

> **Operator skill.** Install into `.agents/skills/` or
> `packages/paseo-plugin-helper/skills/` for the agent to load. The scripts
> and CI workflow referenced here are the source of truth — this skill is the
> operator-facing guide.

## 1. Determine the publish path

Before staging, check whether the package has ever been published:

```sh
npm view <package-name> versions --json
```

- **Definitive 404** (`E404`, `404 Not Found`, `not in this registry`) →
  **first-publish path** (§2). The package has never been on the registry.
- **Any other response** (including an array of versions) →
  **stage-publish path** (§3). The package exists and can be staged.
- **Non-404 failure** (auth `E401`, network error, TLS error) → **stop**. Do
  not guess. Fix the registry access problem first; a silent misread here
  sends a first-publish package down the stage path, which creates the
  `0.0.0-stage` placeholder instead of the real version.

## 2. First-publish path (brand-new packages)

A package that has never been published **cannot** be staged. `npm stage
publish` exits 0 but only creates the `0.0.0-stage` placeholder — the real
version never reaches the staging area. Approving that placeholder would
move `latest` to `0.0.0-stage`.

**One-time remediation** (requires operator 2FA/OTP):

```sh
# Run in the package directory (e.g. plugins/permission-logger/)
npm publish --access public
```

npm prompts for the OTP. After this succeeds, the package exists on the
registry and all future versions can go through the normal stage-publish
path (§3).

> **Do NOT run `npm stage approve`** for a placeholder-only stage list. The
> `scripts/npm-stage-native.mjs` guard (`assertApprovable`) refuses this and
> prints the same remediation.

## 3. Stage-publish path (existing packages)

### 3a. Local pack (inert, no registry, no credentials)

```sh
make npm-stage
# or: node scripts/publish-npm.mjs --stage
```

This packs every plugin directory into `publish-stage/<id>/<tarball>` plus
`manifest.json` and `PUBLISH.md`. It refuses a dirty tree. The output is
inert — nothing has touched the npm registry.

### 3b. CI workflow dispatch (registry staging, no 2FA)

The `.forgejo/workflows/npm-stage.yml` workflow stages to the npm registry
when dispatched manually with the `NPM_TOKEN` secret:

1. Go to **Actions → npm stage (publishable tarballs) → Run workflow**.
2. The workflow runs `make npm-stage` (local pack), then
   `node scripts/npm-stage-native.mjs --manifest=publish-stage/manifest.json`
   which calls `npm stage publish <tarball>` for each package.
3. `npm stage publish` (npm ≥ 11.19) puts each version into the registry's
   staging area **without** a 2FA prompt. The versions are not publicly
   visible yet.

> **npm version note:** The CI container ships npm 10, which lacks
> `npm stage`. The workflow installs `npm@latest` into a user-writable
> prefix for the staging step only.

### 3c. Human approve (2FA)

After the CI workflow completes, a human approves each staged version:

```sh
npm stage list
npm stage view <stage-id>
npm stage approve <stage-id>   # prompts for 2FA/OTP
```

This promotes the staged version to live on the registry.

## 4. Verify the staged version

**Never trust the exit code of `npm stage publish`.** It exits 0 even when
only the `0.0.0-stage` placeholder was created. Always verify:

```sh
npm stage list <package-name> --json
```

Check that the **intended version** appears in the staging area — not just
`0.0.0-stage`.

The `scripts/npm-stage-native.mjs` script does this automatically via
`verifyStage()`:

- If the intended version is in the staging area → outcome `staged`.
- If only `0.0.0-stage` is present → outcome `placeholder` (warns, does
  **not** notify for approval).
- If the version is absent entirely → outcome `failed`.

The `scripts/publish-npm.mjs --publish` command also verifies: it re-reads
`manifest.json` and refuses to publish if the staged version does not match
the current plugin version.

## 5. Publish (promote to live)

After approval, the version is live on the registry. To publish directly
(bypassing the stage/approve flow):

```sh
# From staged tarballs:
node scripts/publish-npm.mjs --publish

# From plugin directories:
node scripts/publish-npm.mjs --publish --from-dirs

# Dry run (print commands only):
node scripts/publish-npm.mjs --publish --dry-run
```

This runs `npm publish --access public` and prompts for 2FA/OTP.

## 6. Common failure modes

| Symptom | Cause | Remediation |
| --- | --- | --- |
| `0.0.0-stage` in stage list, intended version absent | First-publish package was staged instead of published | Run `npm publish --access public` (2FA) once; then re-stage |
| `npm stage publish` exits 0 but version missing | Placeholder-only stage (same as above) | Same as above — verify with `npm stage list` |
| `E401 Unauthorized` from `npm view` | Bad/missing npm token | Fix `NPM_TOKEN` secret or `~/.npmrc` auth |
| `npm stage` command not found | npm < 11.19 | Upgrade npm (`npm install -g npm@latest`) |
| `staged <id>@<old> does not match current <new>` | Stage is stale | Re-run `make npm-stage` to re-pack |
| `refusing to stage/publish: working tree is dirty` | Uncommitted changes | Commit or stash; use `--allow-dirty` to override |
| `You cannot publish over the previously published versions` | Version already on registry | Bump the version; npm cannot restage a live version |
| `no staged entry for <version>; nothing to approve` | Nothing in staging area | Re-run the CI workflow dispatch |

## 7. Quick reference

```sh
# 1. Check if package exists
npm view <package-name> versions --json

# 2a. First-publish (one-time, 2FA)
cd plugins/<plugin-name> && npm publish --access public

# 2b. Stage-publish (existing packages)
make npm-stage

# 3. Dispatch CI workflow (Actions → npm stage → Run workflow)

# 4. Verify
npm stage list <package-name> --json

# 5. Approve (2FA)
npm stage approve <stage-id>

# 6. Publish directly (alternative to stage/approve, 2FA)
node scripts/publish-npm.mjs --publish
```
