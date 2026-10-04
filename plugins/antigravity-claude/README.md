# Antigravity Claude Provider for Paseo

Paseo plugin that registers `antigravity-claude` as a separate provider alongside the default `antigravity` provider.

## What it does

Google Antigravity tracks quota for Gemini models and partner models (Claude and GPT) in separate pools. This plugin exposes the Claude and GPT models under their own provider name in Paseo, sets `claude-sonnet-5-5-medium` as the default model, and sets `AGY_TARGET_POOL=claude` so the underlying CLI wrapper can route requests to an account with available Claude quota.

## How it works

1. It registers provider ID `antigravity-claude`.
2. It queries `agy models` at startup and filters the list down to model IDs starting with `claude` or `gpt`. Any new Claude/GPT models added upstream appear automatically.
3. When starting an agent session, it sets `AGY_TARGET_POOL=claude` in the child environment before launching the `agy` CLI binary.

## Installation

This plugin is installed automatically by running `./install.sh` from the repository root.

To add it manually to `~/.paseo/config.json`:

```json
{
  "plugins": {
    "antigravity-claude": {
      "source": "directory",
      "path": "/path/to/paseo/plugins/antigravity-claude",
      "enabled": true
    }
  }
}
```

Then restart the daemon:

```bash
paseo daemon restart
```

## Verification

Check that the provider is recognized and ready:

```bash
paseo provider ls
paseo provider models antigravity-claude
```
