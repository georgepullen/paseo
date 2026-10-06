# paseo-research-feed

A human-gated research feed for [Paseo](https://paseo.sh): fetch public paper
sources, rank them into a daily skim you can actually finish, and — only where
*you* decide it's worth it — promote, discuss, shape, queue, and run an idea.

The pipeline has two decoupled layers, and you are the only coupling between
them:

```
LAYER 1 — INSPIRATION (upstream, many per day, decoupled):
  pinned sources (HF daily papers · arXiv newest-by-category · OpenReview search)
    → the scout ranks each into a jargon-free 30-second capture card
      (a lazy 10-minute digest is generated when you open one)

           ── you pick what appeals ──▶

LAYER 2 — IDEAS (downstream, operator-driven, many in flight):
  promote a reel → an IDEA track
    → discuss free-form with the mentor
      → shape into a one-GPU experiment
        → QUEUE it (your call — the only gate)
          → run → debrief → the debrief nudges tomorrow's feed
```

There is no graded gate. Your queue action is the only thing between an idea
and a run. The cards' open questions exist for thinking, not scoring.

## Install

From the git repository (works for any fork/host carrying this path):

```sh
paseo plugin add georgepullen/paseo --path plugins/paseo-research-feed
```

npm is optional for the plugin's own install (the daemon resolves the shared
helper in this checkout), but **Node.js ≥ 18 and npm on `$PATH` are required at
runtime** — the agent seam spawns its ACP adapter via `npx`.

## Configuration

Everything lives in the plugin's Settings screen (gear icon) and is
settings-overridable; defaults are generic and source-pinned.

| Setting | Default | What it does |
| --- | --- | --- |
| Hugging Face daily papers | enabled | `https://huggingface.co/api/daily_papers` — the day's hand-picked papers |
| Hugging Face endpoint | (above) | Repointable; its host becomes the fetch allowlist entry |
| arXiv newest-by-category | enabled | Atom, newest-first, via `https://export.arxiv.org/api/query` |
| arXiv endpoint | (above) | Repointable Atom query endpoint |
| arXiv categories | `cs.LG, cs.AI, cs.RO, cs.CV` | Comma-separated `cat:` queries, one fetch per category |
| OpenReview notes search | enabled | `https://api2.openreview.net/notes` + `/search?term=…` |
| OpenReview endpoint | (above) | Repointable notes endpoint |
| OpenReview terms | `continual learning, weight-space merging, LoRA merging, task vectors, model editing` | Comma-separated search terms, a few notes each |
| Relevance lens | generic consumer-GPU research weighting | Plain text steering ranking + tailoring. **This is the tuning knob** — describe what you want the feed weighted toward |
| Feed size | `50` | Capture cards per refresh (5–200) |
| Eager digests | `10` | Top-ranked cards whose long digest is generated at refresh time; the rest generate lazily on open |
| Agent vendor | `claude` | `claude` or `codex` — which native agent answers every reasoning call over ACP |
| Agent timeout | `300000` | ms ceiling for one agent turn (runs may extend up to 1 h by GPU budget) |

Privacy posture: the fetch allowlist is **derived from your configured
endpoints only** — nothing else is ever contacted for discovery, and one
failing source never fails the refresh. No credentials are stored or proxied;
reasoning calls use whichever vendor agent's own ambient login is already set
up on the daemon host (Claude Code or Codex via the Agent Client Protocol).
Set `RESEARCH_FEED_STUB=1` in the daemon environment to run the whole pipeline
against deterministic offline stubs (no network, no agent login).

## Surfaces

- **Sidebar: Research Feed** — two tabs.
  - *Feed*: capture cards (title, one-liner, relevance, link out) with
    **Digest** (lazy), **Save**, **Dismiss**, and **Promote**.
  - *Ideas*: idea tracks with a stage badge (`exploring → shaped → queued →
    running → debriefed`), a text-thread discussion with the mentor, and the
    **Shape**, **Queue**, and **Run** verbs wired to the pipeline RPCs.
- **Settings screen**: the table above.
- **Command center**: "Refresh research feed" opens the feed (which refetches
  on mount); the surface's **Refresh** button performs the full fetch + rank
  + eager-digest pass.

## Honest scope

- **Running a queued idea executes in an agent workspace on the daemon
  host** (a per-idea directory under the plugin state dir). The agent builds
  and runs the experiment there, within the experiment's GPU-budget-derived
  timeout.
- **Remote-GPU dispatch is out of scope.** There is no scheduler, no remote
  worker claim, no multi-host coordination — if your daemon host has no
  usable GPU, queued runs will not be meaningful.
- Digests and cards are only as good as the configured sources and lens;
  discovery is bounded by design (allowlisted endpoints only) and never
  free-roams the web.
- Reasoning quality/cost depends entirely on the ambient vendor login; the
  plugin carries no credentials and performs no interactive login. If the
  vendor's auth is expired, calls fail with a `BLOCKED_AUTH` error naming the
  fix.

## Suggested cafe caveats (for a paseo.cafe listing)

- Requires a logged-in `claude` or `codex` CLI on the daemon host; refresh
  costs tokens roughly proportional to feed size + eager digests.
- The relevance lens default is generic; expect to tune it once for useful
  ranking.
- `RESEARCH_FEED_STUB=1` is the safe way to evaluate the surfaces before
  wiring a real agent.
- Runs execute real code on the daemon host — queue accordingly.

## Development

```sh
npm run typecheck   # tsc --noEmit (helper resolved via tsconfig paths)
npm run test        # node --test: store round-trip, Atom parser, RPC schemas, allowlist
npm run stamp       # refresh shared/version.ts (PLUGIN_VERSION)
```
