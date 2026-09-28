# forgejo-issues-check: TS port parity evidence (#733)

Date: 2026-09-28. Python original (read-only reference):
`/home/xpufx/code/platform/scripts/forgejo-issues-check` (Python 3.12.3).
Port: `server/issues-check.ts`. Ported regression suite: `server/issues-check.test.ts`
(mirrors `forgejo-issues-check.test.py` fixture for fixture — same NOW anchor,
same issue helpers, same stubs via the `IssuesCheckIo` seam, same expectations).

## Method

The harness (transient; not committed) drove **both implementations through
identical plumbing**: the same `fgjx` stub binary on `PATH` serving canned
Forgejo API responses, the same pre-seeded `~/.cache` board-state file under a
scenario-specific `HOME`, and the same CLI arguments. For each scenario it
compared five dimensions:

1. **stdout**, byte-for-byte (the only normalization: the `timestamp` field is
   wall-clock and the two runs happen seconds apart);
2. **exit code**;
3. **stderr**, byte-for-byte;
4. the **persisted board-state cache file**, byte-for-byte, after the run;
5. the **action log** of mutating fgjx calls (`fgjx api -X POST
   .../comments` payloads and `fgjx issue edit ...` argv), proving the recovery
   path issues identical Forgejo commands with identical comment bodies.

## Cases (20 scenarios, counted 34 issues with per-dimension verdicts)

Identical = identical across all five dimensions.

| # | Scenario | Board state | py/ts exit | identical |
|---|---|---|---|---|
| 01 | empty board | zero open issues | 0/0 | yes |
| 02 | fresh board, all first-seen | no cache, 3 mixed issues | 1/1 | yes |
| 03 | cached, unchanged | cache matches signatures, actionable issue present | 0/0 | yes |
| 04 | cached, changed | stale cache; new approval + blocked issue | 1/1 | yes |
| 05 | taxonomy sweep | all 9 categories + ignore-label rule + not-actionable filter | 1/1 | yes |
| 06 | stale-WIP dry run | stale/fresh/suppressed/marker/closed WIP mixed | 1/1 | yes |
| 07 | stale-WIP real recovery | same board, runs the real comment+label edit | 1/1 | yes |
| 08 | comment POST failure | fgjx POST exits 1; error surfaces on stderr | 1/1 | yes |
| 09 | custom threshold (`--stale-wip-hours 0.5`) | WIP above/below threshold | 0/0 | yes |
| 10 | human feedback | oktay / plain human / `xpufx` / envelope / `[x-agent]` / multiline >100 chars / comments=0 | 1/1 | yes |
| 11 | `--role worker` | same board as 05, worker perspective | 1/1 | yes |
| 12 | `--all` | unchanged cache, actionable issues reported | 1/1 | yes |
| 13 | markdown, full taxonomy | default format | 1/1 | yes |
| 14 | markdown, stale-WIP dry run | | 1/1 | yes |
| 15 | markdown, stale-WIP real | "recovered N/M" line | 1/1 | yes |
| 16 | negative `--stale-wip-hours` | refusal | 2/2 | **documented divergence** |
| 17 | fgjx transport failure | issues query exits 7 | 0/2 | **documented divergence** |
| 18 | garbage comment payload | comments endpoint returns non-JSON | 1/1 | yes |
| 19 | default host/repo plumbing | no `--hostname`/`-R` args | 1/1 | yes |
| 20 | `--force` | forced re-check incl. feedback re-probe | 1/1 | yes |

Result: **18/20 scenarios identical on every compared dimension**; 2 recorded
divergences, both understood and intentional (below). The raw JSON of the
comparison run is transient; this table plus the ported test suite are the
durable record.

## The two recorded divergences

1. **Negative `--stale-wip-hours` (scenario 16).** The Python CLI refuses via
   `argparse` (exit 2, full usage text); the port throws
   `--stale-wip-hours must be non-negative` (exit 2 through the harness).
   Same refusal, same exit code, different error surface. Understood: the
   plugin calls the module directly, so the CLI's usage banner does not exist.

2. **fgjx transport failure (scenario 17).** Python treats a failing
   `fgjx` query as an empty board and exits 0 silently — exactly the silent
   degradation #733 removes. The port throws
   `IssuesCheckTransportError`; `runBoardSweep` logs it as
   `[error] board check failed`, carries it in `BoardSweepResult.errors`, and
   reports the failure to Front Desk. Intentional per acceptance item 3:
   absence of the Forgejo transport is a bug, not a clean board.

## Smaller understood differences (recorded, not matched)

- **`timestamp` JSON field**: Python formats wall-clock ISO with microseconds
  and `+00:00`; the port uses `Date.toISOString()` (milliseconds, `Z`). Not
  normalized for the comparison; excluded because it is unconsumed wall-clock
  metadata and the two runs are anyway seconds apart — only its shape differs.
- **POST-comment payload bytes**: Python `json.dumps` writes `"body": "…"`
  (space after the colon); `JSON.stringify` writes `"body":"…"`. Both decode
  to the identical comment body; the action-log comparison canonicalizes the
  JSON and is otherwise byte-identical.
- **Set-iteration order** (`EFFORT_WEIGHTS` last-match-wins, `target/`
  selection): Python iterates unordered hash sets, which is nondeterministic
  across runs for multi-match labels; the port iterates the issue's label
  array, which is deterministic. Identical for any well-formed issue (one
  `size/*` and one `target/*` label).
- **Malformed label payloads** discovered during harness development:
  `{"name": {...}}` makes Python raise `TypeError: unhashable type: 'dict'`
  and exit non-zero; the port skips the malformed label entry. Out-of-contract
  input; recorded rather than aligned.
- **Missing `title` / null `comments` keys**: Python raises (`KeyError`,
  `TypeError`); the port coerces. Out-of-contract input.

## Bugs the harness caught in the port itself (fixed before the final run)

- `ensureAsciiJson` escaped structural indentation newlines as `\u000a`
  (`json.dumps` keeps structure raw and only escapes non-ASCII inside values).
- `runStaleWipCommand` crashed with EPIPE when the child exits without reading
  the stdin payload; `subprocess.run`'s `communicate()` swallows the broken
  pipe, and the port now does too (a harness-discovered fix, covered by
  scenario 08).

## Divergences outside this port

- The stale-WIP GitHub Actions workflow still runs the Python script
  cross-repo (`uses: ...@main`); CI-side behavior is unchanged here.
- Platform-side deprecation of the Python original is an owner follow-up —
  this change has no push rights to `platform`.
