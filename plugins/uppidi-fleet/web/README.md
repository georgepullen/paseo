# uppidi-fleet/web — standalone fleet dashboard

Standalone web application for monitoring and managing the Uppidi fleet.
Independent from the Paseo desktop plugin UI and the `uppidi-fleet` plugin: it
connects to a Paseo daemon over its native WebSocket API (via
`@getpaseo/client`) from any host. The dashboard works even when the plugin is
not installed or loaded on that daemon.

## Run

```bash
npm install
npm run dev      # http://10.20.30.24:5174 (binds on 0.0.0.0, accessible over network)
npm run build    # emits dist/
npm run preview  # serves dist/ on 0.0.0.0:4174
```

## Configure the daemon endpoint and bind host

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` / `VITE_HOST` | `0.0.0.0` | Bind host for dev & preview web server (or use `--host`) |
| `VITE_PASEO_DAEMON_HOST` | `10.20.30.24:6767` | `host:port` of the Paseo daemon |
| `VITE_PASEO_DAEMON_URL` | — | Full override, e.g. `ws://fleet-box:6767` |
| `VITE_PASEO_DAEMON_TOKEN` | — | Daemon password when auth is enabled |

Copy `.env.example` to `.env` to set them locally. The host and token are
also editable in the connection bar at runtime (the token persists in
`localStorage` under `uppidi-fleet.daemon-token`).

## Live daemon requirements (10.20.30.24)

The dashboard opens `ws://<daemon-host>/ws` from the browser, so the daemon
must allow the dashboard host. This dashboard cannot change daemon security
settings — configure these on the daemon host:

- **Listen address**: the daemon must bind a LAN-reachable address, e.g.
  persisted `daemon.listen = "10.20.30.24:6767"` (env `PASEO_LISTEN`).
- **Hostnames**: add the dashboard origin, for example
  `http://10.20.30.24:4174` (dev: `http://10.20.30.24:5174`), to the daemon's
  hostname allowlist in `daemon.hostnames` or the `PASEO_HOSTNAMES` environment
  variable. A missing hostname fails the handshake, which the browser reports
  only as `WebSocket connection to 'ws://10.20.30.24:6767/ws' failed`.
- **Auth**: when the daemon has `daemon.auth.password` set (env
  `PASEO_PASSWORD` or `paseo daemon set-password`), enter that password in
  the connection bar Token field (or `VITE_PASEO_DAEMON_TOKEN`). A missing
  password closes the socket with `Password required`; a wrong one with
  `Incorrect password` (close code 4401).

| Symptom in dashboard | Cause | Fix |
| --- | --- | --- |
| `Could not reach ws://…` right after Connect | Dashboard hostname not allowlisted, or daemon unreachable | Add the dashboard origin to `daemon.hostnames` / `PASEO_HOSTNAMES`; check `daemon.listen` |
| `Daemon requires a password` | `daemon.auth.password` is set, no token supplied | Enter the token in the connection bar |
| `Daemon rejected the password` | Wrong token | Re-enter the daemon password |

## What it shows

- **Fleet health** — aggregated running/idle/errored/attention counts plus
  frontdesk / orchestrator / worker split.
- **Running agents** — frontdesk, orchestrators, and workers grouped from the
  native `agents.list()` snapshot and its WebSocket subscription.
- **Candidate issues** — open Forge issues queried through the native daemon
  `searchForge()` API using native workspace directories.
- **Teardown fleet** — danger modal archives selected agents through native
  agent handles (`agents.ref(id).archive()`).

## Native data flow

After connecting, the app subscribes to native agent and workspace snapshots
with `agents.list({ subscribe: {} })` and `workspaces.list({ subscribe: {} })`.
Snapshot/update notifications refresh the dashboard; explicit refreshes use
the same native lists. Forge issues are queried with `searchForge()` for each
known workspace. No plugin RPC is made by the web app, so the daemon does not
need the `uppidi-fleet` plugin loaded.

## Tests

```bash
npm run typecheck
npm test
```
