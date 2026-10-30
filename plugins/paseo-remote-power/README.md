# paseo-remote-power

Wake and status control for remote machines — homelab boxes, GPU workstations,
lab servers — from the Paseo daemon.

The plugin keeps a small roster of hosts. Each host has an ordered list of wake
transports (generic: an HTTP POST endpoint, a Wake-on-LAN magic packet, or a
local command), a reachability probe (ssh `BatchMode`/`ConnectTimeout`, or a
custom status command that answers by exit code), and a bounded wake window
(default 110s). Waking is idempotent: if the probe already says up, nothing is
sent. You get:

- a **dashboard** in the Paseo client — one card per host with a Wake button
  (live progress while a wake runs), a 24h uptime strip, the wake board's
  reachability for microlink hosts, and CPU/GPU/RAM while the host is up, plus
  an add/edit host form;
- an **embedded MCP server** injected into every new agent (interactive or
  scheduled) with three tools: `power_status`, `power_wake`, `power_job_status`
  — so an agent can wake its machine before running work on it;
- **settings**: default wake window, probe timeout, max concurrent wakes, and a
  toggle for the agent injection.

## Install

Install it like any Paseo plugin (from the plugin directory or via the paseo
CLI), then add your first host on the **Remote power** surface. Requirements:
`paseo >= 0.10.0`, node >= 18.

## The host model

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable id (`host-xxxxxxxx`, generated). |
| `name` | string | Display name; unique per roster. |
| `sshTarget` | string? | ssh alias or `user@host` used by the reachability probe. |
| `statusCommand` | `{command, args?}?` | Optional probe run on the daemon host; exit 0 = up. Wins over ssh. |
| `wakeWindowSeconds` | number? | Per-host wake window override (10–3600, default from settings). |
| `wakeTransports` | array | Ordered wake transports; first success wins, then verification starts. |
| `inferenceProxy` | `{listenPort, upstreamPort, upstreamHost?, wakeTimeoutSeconds?, pollSeconds?}?` | Local inference proxy (see below). `upstreamHost` defaults to `127.0.0.1`, `wakeTimeoutSeconds` to 60 (10–300), `pollSeconds` to 5 (1–30); defaults apply at use sites, not in the stored record. |
| `holdCommand` | `{command, args?}?` | Keep-awake hold command run on the daemon host while a matching agent is in a turn (same shape as `statusCommand`). |
| `agentModels` | string[]? | Model prefixes (max 16); a local agent whose model starts with any prefix holds this host awake. |

Transports:

| Type | Fields | Behavior |
| --- | --- | --- |
| `http` | `url`, `tokenRef?` | `POST` to the endpoint; when `tokenRef` is set, the matching bearer token from the plugin state dir is sent as `Authorization: Bearer …`. |
| `wol` | `mac`, `host?` | Standard 102-byte magic packet over UDP (port 9). `host` targets a subnet-directed or relay address; default is broadcast. |
| `command` | `command`, `args?` | Runs a local command on the daemon host; exit 0 = accepted. |
| `microlink` | `host`, `mode?`, `secretRef?`, `port?`, `scheme?`, `headerPrefix?` | HMAC-signed wake to a wake authority on an ESP32-S3: a signed `POST /v1/wake` over HTTP, or one signed UDP datagram on the tailnet (`mode: "udp"`). Defaults: `mode` `http`, `port` 48320. `secretRef` names the hex secret in the plugin state dir; the secret never appears in a host record. The authorization scheme and header names are configurable per host (defaults `Microlink-HMAC` / `X-Wake-`; older authorities may override scheme and header names per host). |

### Example configuration

Everything lives in the Paseo plugin state dir
(`~/.paseo/plugin-data/xpufx/paseo-remote-power/`) at runtime — never in this
repository. Placeholder shapes:

```json
{
  "hosts": [
    {
      "id": "host-1a2b3c4d",
      "name": "lab-gpu-box",
      "sshTarget": "lab-gpu-box",
      "wakeWindowSeconds": 110,
      "wakeTransports": [
        { "type": "http", "url": "http://192.0.2.10:8080/wake", "tokenRef": "lab-gpu-wake" },
        { "type": "microlink", "host": "wake.tailnet.net", "mode": "udp", "secretRef": "wake-secret" },
        { "type": "wol", "mac": "00:11:22:33:44:55", "host": "192.0.2.255" },
        { "type": "command", "command": "/usr/local/bin/wake-lab-gpu", "args": ["--port", "9"] }
      ],
      "createdAt": 1767000000000,
      "updatedAt": 1767000000000
    }
  ]
}
```

Bearer tokens are stored **only** in `tokens.json` in the same state dir,
keyed by `tokenRef`. The host form's write-only "Bearer token" field stores one for
the host and wires it to every `http` transport without an explicit ref;
`hosts.json` itself never contains secrets. Microlink hex wake secrets work
the same way: `secretRef` names a key in `tokens.json`, resolved only when a
wake runs, and never logged or echoed.

### Reachability probe

`statusCommand` wins over the microlink observer, which wins over ssh: a host
with a `microlink` transport is asked first via its unsigned
`GET /v1/observer` (`target_awake: true` = up; no answer falls through to
ssh), so the device's own wake authority settles the question without an ssh
round-trip.

## Wake semantics (ported from a battle-tested wake script)

1. **Idempotence.** Before waking, the host is probed. Already up → nothing is
   sent; the API answers `up` / `alreadyUp`.
2. **Ordered transports with fallback.** Transports run top to bottom; the
   first success starts verification.
3. **Bounded verification.** The engine polls the probe every 3s until the
   host is reachable or the wake window (default 110s) expires, with one final
   probe past the deadline.
4. **Two distinct failure modes.** `no-transport` — nothing accepted the wake
   request; `never-reachable` — a transport accepted the burst but the host
   never came up inside the window. These are reported per job (`error.mode`)
   so an agent can tell "the wake path is broken" from "the machine is sick".
5. **Bounded concurrency.** At most `maxConcurrentWakes` jobs run at once;
   a host with a wake in flight returns the existing job instead of stacking
   another.

## Inference proxy (plugin server only)

For each host with `inferenceProxy`, the plugin server runs one HTTP proxy on
`127.0.0.1:listenPort` forwarding to `upstreamHost:upstreamPort` (method, path,
headers — minus hop-by-hop headers — buffered body up to 32 MiB, and the
streamed response are preserved; long generations are not cut by proxy
timeouts). Point a local inference client at the listen port instead of the
sleeping host. If the connection fails before any request bytes were flushed
upstream, the proxy fires one wake through the shared engine (idempotent —
concurrent requests do not stack wakes), holds the request, and retries every
`pollSeconds` (default 5s). A forward that succeeds via this wake path also
runs the host's `holdCommand` once, fire-and-forget. If the host is still
unreachable when `wakeTimeoutSeconds` (default 60s) elapses, the client gets
`503 {"error":{"message":"<host name> is asleep and did not wake within <N>s","type":"server_error","code":"host_asleep"}}`.
A failure *after* the request was flushed is never resent (that could duplicate
a generation): the client gets `502` with code `host_offline_midrequest`.
A listen failure (e.g. the port is taken) is logged and that proxy is skipped —
it never takes the plugin down. Proxies resync whenever hosts are added,
updated, or removed. The MCP server does not run proxies; this is a
plugin-server-only feature.

## Agent keep-awake hold (plugin server only)

For each host with `agentModels` (and usually a `holdCommand`), the plugin
server watches local agent turns. While a local agent whose model starts with
any configured prefix is in an active turn (status `running`/`initializing`,
or a non-null active turn), the host is held awake: on the first such agent
the plugin fires one wake and runs `holdCommand` immediately, then re-runs
`holdCommand` every 600s until the last matching agent's turn ends. The
600s cadence is sized for holds like an ssh touch of a registrar wake-hold
file with a 3600s TTL. A 60s reconcile against the live agent list repairs
missed turn start/end events. Like the proxy, this lives only in the plugin
server, not the MCP server.

Both `inferenceProxy`/`holdCommand`/`agentModels` are **file-configured for
now**: edit `hosts.json` in the plugin state dir (shown above) and reload the
plugin — the host form does not edit them. Host updates through the RPC
path preserve these fields when the update omits them (explicit `null`
clears them).

## Agents: power_status / power_wake / power_job_status

The plugin registers an MCP server (stdio) at the `agent.create` gate, so
every agent the daemon spawns — including **scheduled agents** — gets the
tools automatically. A scheduled agent that needs a machine awake before it
works looks like:

1. `power_status({})` → is `lab-gpu-box` already up?
2. If down: `power_wake({ hostId: "host-1a2b3c4d" })` → `{ jobId, status }`
   immediately.
3. Poll `power_job_status({ jobId })` until the job reports `up` or `failed`.
4. On `failed`, read `error.mode`: `never-reachable` means the wake path
   worked but the machine did not come up (worth retrying once or paging a
   human); `no-transport` means the wake path itself is down.

Jobs are shared state (the plugin server and the MCP server coordinate through
the same jobs file in the plugin state dir), so a wake started from the
dashboard is visible to agents and vice versa.

## Dashboard

- **Uptime strip.** While the daemon runs, the plugin server probes every host
  every 5 minutes with the same probe `power_status` uses (never a wake) and
  keeps 24 hours of samples in `history.json` in the plugin state dir. The
  strip shows 96 fifteen-minute segments; time the daemon was not running is a
  gap, not a guess. A new host's strip fills in over its first day.
- **Wake board.** For hosts with a microlink transport, each sample also
  records whether the wake authority's observer answered, and its Wi-Fi signal
  strength when the device reports `rssi`.
- **Compute.** While the dashboard is open and the host is up, the server runs
  one read-only script over the host's `sshTarget` (piped to `sh -s`, so the
  remote login shell does not matter): CPU, load and memory from Linux
  `/proc`, plus the first GPU's temperature, power, utilisation, VRAM, fan and
  process count when `nvidia-smi` is installed. Results are cached for 15s.
  Missing fields are left out, and hosts without `sshTarget` show no compute.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `defaultWakeWindowSeconds` | 110 | Verification window for wake jobs. |
| `probeTimeoutSeconds` | 8 | Connect timeout for the ssh probe. |
| `maxConcurrentWakes` | 2 | Global cap on simultaneous wake jobs. |
| `agentInjectionEnabled` | true | Inject the power tools into new agents (reload to apply). |

## Caveats worth knowing before you rely on it

- **ssh probing needs key auth from the daemon host.** The probe runs
  `ssh -o BatchMode=yes -o ConnectTimeout=<n> <target> true` — set up the
  key/alias on the machine running the Paseo daemon, or use `statusCommand`
  instead.
- **WoL needs an L2 path** to the target's broadcast domain, or a configured
  target `host` (a subnet-directed address or a WoL relay). Waking across the
  internet with plain WoL does not work; put an `http` transport or a relay in
  front of it.
- **The `command` transport runs arbitrary shell on the daemon host.** Host
  configuration is trusted operator input — anyone who can edit the roster can
  run commands where the daemon runs.
- **Tokens are bearer secrets.** They live in the state dir with 0600 files;
  treat that directory accordingly. HTTP wake endpoints should be on a
  trusted network or behind their own auth.
- **Probes are best-effort.** "unknown" (no probe configured, or the probe
  itself errored) is reported honestly rather than guessed.

## Development

```sh
npm run typecheck   # tsc --noEmit
npm test            # typecheck + node --test suites (unit + stdio protocol)
```

Tests are hermetic: fixture state dirs and fake spawners/sockets, never a real
network or the developer's home.

## License

MIT — see [LICENSE](./LICENSE).
