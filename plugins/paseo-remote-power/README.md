# paseo-remote-power

Wake and status control for remote machines — homelab boxes, GPU workstations,
lab servers — from the Paseo daemon.

The plugin keeps a small roster of hosts. Each host has an ordered list of wake
transports (generic: an HTTP POST endpoint, a Wake-on-LAN magic packet, or a
local command), a reachability probe (ssh `BatchMode`/`ConnectTimeout`, or a
custom status command that answers by exit code), and a bounded wake window
(default 110s). Waking is idempotent: if the probe already says up, nothing is
sent. You get:

- a **roster surface** in the Paseo client — status dots (up / down / waking /
  unknown, polled), a Wake button per host with live job progress, add/edit/
  remove forms, and the recent wake-jobs list;
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

Transports:

| Type | Fields | Behavior |
| --- | --- | --- |
| `http` | `url`, `tokenRef?` | `POST` to the endpoint; when `tokenRef` is set, the matching bearer token from the plugin state dir is sent as `Authorization: Bearer …`. |
| `wol` | `mac`, `host?` | Standard 102-byte magic packet over UDP (port 9). `host` targets a subnet-directed or relay address; default is broadcast. |
| `command` | `command`, `args?` | Runs a local command on the daemon host; exit 0 = accepted. |

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
keyed by `tokenRef`. The roster form's write-only "token" field stores one for
the host and wires it to every `http` transport without an explicit ref;
`hosts.json` itself never contains secrets.

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
the same jobs file in the plugin state dir), so a wake started from the roster
UI is visible to agents and vice versa.

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
