# paseo-permission-logger

Audit logger for Paseo permission requests: records tool/plan/mode/question
permission decisions with agent attribution, and exposes them through a
queryable sidebar surface.

Every time an agent hits a permission gate — a tool call, a plan approval, a
mode switch, a question prompt — the daemon emits a request event and later a
resolution event. `permission-logger` correlates the two, normalizes the
verdict to `allow` / `deny`, stamps which agent (id, title, model, provider,
mode, cwd) made the request, and appends the entry to a local JSONL audit log.
The Permission Log sidebar surface renders that log with search and
allow/deny filtering.

Built on [paseo-plugin-helper](https://github.com/xpufx/paseo/tree/main/packages/paseo-plugin-helper), the shared Paseo plugin runtime.

> [!NOTE]
> **Prerequisites & Platform Support**:
> - Requires **Paseo >=0.9.0** (declared in [`paseo-plugin.json`](paseo-plugin.json)).
> - Server-side storage is plain Node `fs` JSONL — Linux, macOS, and Windows supported.

## Installation

Install from npm:

```sh
paseo plugin add npm:@xpufx/paseo-permission-logger
```

Or install directly from the Git repository:

```sh
paseo plugin add xpufx/paseo --path plugins/permission-logger
```

Then reload the daemon. On load, `index.server.ts` logs:

```
permission-logger plugin contributed: audit log live
```

along with the resolved log file path.

### Opening the Permission Log sidebar

The client half (`index.client.tsx`) registers a single sidebar surface:

| Property | Value |
| --- | --- |
| Surface id | `permission-logger` |
| Title | `Permission Log` |
| Icon | `ShieldCheck` |

In Paseo Desktop, open the **Permission Log** item in the sidebar (the shield
icon). The surface polls `permission-logger.query` every **5 seconds**
(`refetchInterval: 5000`) while mounted and renders:

- A search box (matches tool name, kind, agent id/model, and arguments).
- **All / Allowed / Denied** decision filter buttons.
- A `DataTable` with `Time`, `Permission` (name + `kind · agentId · model` +
  summarized input), and `Decision` (`Allowed` / `Denied` badge) columns.
- Loading, error-with-retry, and empty states.

## Configuration

There is no settings UI. The only knob is the log file location:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PASEO_PERMISSION_LOG_PATH` | `~/.paseo/logs/permissions.jsonl` | Where audit entries are appended. |

Set the variable on the daemon process before it starts to redirect the log
(e.g. per-host paths, ephemeral test dirs). Parent directories are created on
first write. Resolution lives in `resolveDefaultLogPath`
([`server/storage.ts`](server/storage.ts)).

## RPC methods

All contracts are defined in [`shared/contracts.ts`](shared/contracts.ts)
using `paseo-plugin-helper`'s `defineContract`. Zod schemas validate both
input and output.

### `permission-logger.query`

Query logged permission decisions, filtered by agent, model, date range, or
decision.

**Input** (`PermissionQueryFilter` — all fields optional):

| Field | Type | Description |
| --- | --- | --- |
| `agentId` | `string` | Exact agent id match. |
| `model` | `string` | Exact agent model match. |
| `provider` | `string` | Exact agent provider match. |
| `decision` | `"allow" \| "deny"` | Filter by verdict. |
| `kind` | `string` | Exact permission kind match (e.g. `tool`). |
| `from` | `string` | ISO timestamp lower bound (inclusive). |
| `to` | `string` | ISO timestamp upper bound (inclusive). |
| `search` | `string` | Case-insensitive substring over name, kind, agent id, and serialized input. |
| `limit` | `integer 1–1000` | Max entries returned (default `100`). |

**Output:**

| Field | Type | Description |
| --- | --- | --- |
| `entries` | `PermissionAuditEntry[]` | Newest-first, truncated to `limit`. |
| `total` | `integer` | Total matches before truncation. |

**Entry shape** (`PermissionAuditEntry`):

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Permission request id (correlates request ↔ resolution). |
| `timestamp` | `string` | ISO-8601 time of the original request. |
| `agentId` | `string` | Resolved agent id. |
| `agentTitle` | `string?` | Agent display name, when known. |
| `agentModel` | `string?` | Model id, when known. |
| `agentProvider` | `string?` | Provider id, when known. |
| `agentMode` | `string?` | Session mode, when known. |
| `agentCwd` | `string?` | Working directory, when known. |
| `kind` | `string` | Permission kind (defaults to `"tool"`). |
| `name` | `string` | Permission name (tool / title / `"permission"` fallback). |
| `input` | `unknown` | Original request input. |
| `decision` | `"allow" \| "deny"` | Normalized verdict. |
| `updatedInput` | `unknown?` | Modified input from an allow-with-edits resolution. |
| `denyReason` | `string?` | Denial message / reason, when provided. |

## Architecture

```
plugins/permission-logger/
├── index.server.ts        # daemon entry: store, logger, event wiring, query handler
├── index.client.tsx       # client entry: initClientHelpers + sidebar surface registration
├── client/
│   └── surface.tsx        # PermissionLoggerSurface (search, filter, DataTable)
├── server/
│   ├── listener.ts        # request/resolution correlation + normalization
│   └── storage.ts         # JSONL append / read / filtered query
├── shared/
│   └── contracts.ts       # Zod schemas + permission-logger.query contract
├── paseo-plugin.json      # plugin id + Paseo version requirement
└── package.json           # workspace package, test/typecheck scripts
```

### Event flow

1. The daemon emits `agent.permission_requested` (or `permission.requested`).
   `handleRequested` stashes the request by id in a pending map
   (`server/listener.ts`).
2. The daemon later emits `agent.permission_resolved` (or
   `permission.resolved`). `handleResolved` merges the resolution with the
   stashed request (stashed attribution wins on conflict, resolution fills
   gaps), drops events with no id, agent, or recognizable decision, validates
   against `PermissionAuditEntrySchema`, and appends to the store.
3. `subscribePermissionEvents` attaches to all four event names when
   `server.on` exists and returns an unsubscribe function called on plugin
   teardown. Unknown event shapes are tolerated — extractors probe several
   key aliases (`id`/`agentId`, `name`/`title`/`tool`, `behavior`/`decision`/
   `verdict`/`approved`/`allowed`, nested `agent`/`session` objects).

### Storage

`PermissionLogStore` (`server/storage.ts`) appends one JSON object per line.
`readAll` skips blank and malformed lines rather than failing the whole read.
`query` applies exact-match filters, an inclusive `from`/`to` timestamp window
(unparseable bounds are ignored), and substring search, then sorts
newest-first and slices to `limit`.

## Development

```bash
# Typecheck
npm run typecheck --workspace=plugins/permission-logger

# Run test suite
npm test --workspace=plugins/permission-logger
```

Tests cover contract schemas, attribution extraction, decision normalization,
request/resolution correlation, store append/read/query filtering, and a
static check that the client entry injects the required host deps.

## License

MIT — see [LICENSE](LICENSE).
