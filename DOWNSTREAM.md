# Downstream fork — x-comms + `x_comms_spawn`

This fork of `xpufx/paseo` carries a downstream patch: the **`x_comms_spawn`**
tool for the x-comms MCP plugin (`plugins/x-comms/mcp`).

Upstream deliberately scopes x-comms to *communication with already-existing
agents* (see [xpufx/paseo#4](https://github.com/xpufx/paseo/issues/4)). We need
agents to be able to **provision new agents on remote daemons** — with a chosen
provider/model, thinking level, and workspace — without a human pre-staging
agents or asking an existing (possibly small, off-task) agent to shell out.
This fork therefore maintains that one feature downstream.

## The delta (vs upstream `main`)

Four files, all under `plugins/x-comms/mcp/`:

| File | Change |
|---|---|
| `paseo-x-comms.mjs` | `x_comms_spawn` tool + zod schema + INSTRUCTIONS blurb; `daemon: "local"` omits `--host` (mirrors `deferDeliver`) |
| `paseo-x-comms.bundled.mjs` | Rebuilt bundle (committed artifact) |
| `test/fixtures/fake-paseo.mjs` | Hermetic `run` subcommand (flag allowlist mirrors real CLI) |
| `test/protocol.test.mjs` | Spawn tests: flag/host wiring, local `--host` omission, provider-error passthrough; tool-count 11 → 12 |

## Syncing with upstream

The fork's `main` = upstream `main` + this downstream patch.

```sh
git remote add upstream https://github.com/xpufx/paseo   # once
git fetch upstream
git checkout main
git merge upstream/main          # or rebase; resolve in plugins/x-comms/mcp
cd plugins/x-comms/mcp
npm ci                           # esbuild must stay PINNED (0.27.7); the
                                 # bundle-reproducible guard test enforces it
node bundle.mjs                  # rebuild the committed artifact
node --test test/*.test.mjs      # full suite must pass
git add -A && git commit         # include the rebuilt bundle
git push origin main
```

## Deploy targets (installed copies)

The running copies are directory-source plugins; after rebuilding, copy the
same four files and re-run `node bundle.mjs` in place:

| Host | Path | Reload |
|---|---|---|
| Mac (Georges-MacBook-Air) | `~/paseo-plugins-mac/x-comms` | `paseo daemon reload` |
| 3090 (george-linux-server) | `/home/george/paseo-plugins/x-comms-pkg` | `paseo daemon reload --host 127.0.0.1:6790` (from Mac) |

New agent sessions pick up the tool list on their next MCP server start;
already-running sessions keep the previous tool set until they restart.

## Global allowlist note

The paseo daemon config (`~/.paseo/config.json` → `agents.providers.pi/omp`)
also carries curated **model pickers**: pi exposes
`qwen3090champ/qwen3.8-27b` + `zai-coding-plan/glm-5.3{,-flash}`; omp exposes
GLM only. Model availability for pi itself comes from `~/.pi/agent/models.json`
(champion + GLM only); don't re-add the llama-lane `qwen3090` provider.
