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

Copy `.env.example` to `.env` to set them locally. The host is also editable
in the connection bar at runtime.

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
