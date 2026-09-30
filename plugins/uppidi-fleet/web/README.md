# uppidi-fleet/web — standalone fleet dashboard

Standalone web application for monitoring and managing the Uppidi fleet.
Independent from the Paseo desktop plugin UI: it connects to a Paseo daemon
over WebSocket (via `@getpaseo/client`) from any host — it does not need to
run on the same server as the daemon.

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
must accept that cross-origin socket. This dashboard cannot change daemon
security settings — configure these on the daemon host:

- **Listen address**: the daemon must bind a LAN-reachable address, e.g.
  persisted `daemon.listen = "10.20.30.24:6767"` (env `PASEO_LISTEN`).
- **CORS origins**: the browser sends `Origin: http://10.20.30.24:4174`
  (dev: `:5174`). Both must be in the daemon allowlist — persisted
  `daemon.cors.allowedOrigins` or env
  `PASEO_CORS_ORIGINS="http://10.20.30.24:4174,http://10.20.30.24:5174"`.
  A missing origin fails the handshake with HTTP 403 `Origin not allowed`,
  which the browser reports only as `WebSocket connection to
  'ws://10.20.30.24:6767/ws' failed`.
- **Auth**: when the daemon has `daemon.auth.password` set (env
  `PASEO_PASSWORD` or `paseo daemon set-password`), enter that password in
  the connection bar Token field (or `VITE_PASEO_DAEMON_TOKEN`). A missing
  password closes the socket with `Password required`; a wrong one with
  `Incorrect password` (close code 4401).

| Symptom in dashboard | Cause | Fix |
| --- | --- | --- |
| `Could not reach ws://…` right after Connect | CORS origin not allowlisted, or daemon unreachable | Add the dashboard origin to `PASEO_CORS_ORIGINS`; check `daemon.listen` |
| `Daemon requires a password` | `daemon.auth.password` is set, no token supplied | Enter the token in the connection bar |
| `Daemon rejected the password` | Wrong token | Re-enter the daemon password |

## What it shows

- **Fleet health** — aggregated running/idle/errored/attention counts plus
  frontdesk / orchestrator / worker split.
- **Running agents** — frontdesk, orchestrators, and workers grouped from
  `uppidi-fleet.agents`.
- **Candidate issues** — open triage candidates from `uppidi-fleet.issues`.
- **Teardown fleet** — danger modal calling `uppidi-fleet.fleet-teardown`
  with explicit target checkboxes and an arm confirmation.

## RPC contract note

The desktop plugin registers the teardown handler as
`uppidi-fleet.fleet-teardown` (`uppidiFleetTeardownContract`). This dashboard
calls that exact method name; `fleet.teardown` in earlier notes refers to the
same handler.

## Tests

```bash
npm run typecheck
npm test
```
