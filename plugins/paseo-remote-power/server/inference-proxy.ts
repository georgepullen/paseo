import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createPluginLogger } from "paseo-plugin-helper/server";
import type { HostRecord, StatusCommand } from "../shared/registry.ts";
import { loadHosts } from "./registry.ts";
import { realSpawn } from "./probe.ts";
import { createWakeEngine } from "./wake-engine.ts";
import { engineSettingsFrom, readSettings } from "./settings.ts";

/**
 * Per-host inference proxy: a local HTTP server (127.0.0.1:listenPort) that
 * forwards to a host's inference endpoint (upstreamHost:upstreamPort). When
 * the upstream refuses the connection the host is most likely asleep: the
 * proxy fires one wake through the shared engine, holds the client request,
 * and retries every pollSeconds until wakeTimeoutSeconds elapses. Requests
 * are never resent once bytes were flushed upstream — a host that accepted
 * and then died gets a 502, not a duplicate generation.
 */

export const MAX_PROXY_BODY_BYTES = 32 * 1024 * 1024;
export const DEFAULT_PROXY_UPSTREAM_HOST = "127.0.0.1";
export const DEFAULT_PROXY_WAKE_TIMEOUT_SECONDS = 60;
export const DEFAULT_PROXY_POLL_SECONDS = 5;
const RUN_COMMAND_TIMEOUT_MS = 30_000;

export interface ProxyLogger {
  info(message: string): void;
  warn(message: string): void;
  error?(message: string): void;
  debug?(message: string): void;
}

/** Runs a hold/status-shaped command; resolves only on exit 0. */
export type RunCommandFn = (command: StatusCommand, host: HostRecord) => Promise<unknown>;

export async function defaultRunCommand(command: StatusCommand, _host: HostRecord): Promise<void> {
  const { code } = await realSpawn(command.command, command.args ?? [], RUN_COMMAND_TIMEOUT_MS);
  if (code !== 0) {
    throw new Error(`command '${command.command}' exited with ${code === null ? "no code" : code}`);
  }
}

export interface InferenceProxyDeps {
  startWake: (host: HostRecord) => Promise<unknown>;
  runCommand?: RunCommandFn;
  logger?: ProxyLogger | ((message: string) => void);
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  loadHostsFn?: () => HostRecord[];
}

export interface ProxySupervisor {
  sync(hosts: HostRecord[]): Promise<void>;
  stop(): Promise<void>;
}

const HOP_BY_HOP_HEADERS: Record<string, true> = {
  connection: true,
  "keep-alive": true,
  "transfer-encoding": true,
  te: true,
  trailer: true,
  "proxy-authorization": true,
  "proxy-connection": true,
  upgrade: true,
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorBody(message: string, code: string): string {
  return JSON.stringify({ error: { message, type: "server_error", code } });
}

function sendJson(res: ServerResponse, status: number, body: string): void {
  if (res.headersSent || res.writableEnded || res.destroyed) return;
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function filteredHeaders(headers: IncomingMessage["headers"], upstreamHost: string, upstreamPort: number, bodyLength: number): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS[lower] || lower === "host" || lower === "content-length") continue;
    out[lower] = value;
  }
  if (bodyLength > 0 || headers["content-length"] !== undefined || headers["transfer-encoding"] !== undefined) {
    out["content-length"] = String(bodyLength);
  }
  return out;
}

function filteredResponseHeaders(headers: IncomingMessage["headers"]): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (HOP_BY_HOP_HEADERS[name.toLowerCase()]) continue;
    out[name.toLowerCase()] = value;
  }
  return out;
}

type ForwardOutcome = "done" | "retryable" | "midrequest" | "client-gone";

interface ActiveProxy {
  host: HostRecord;
  server: Server;
  configKey: string;
}

export function createProxySupervisor(deps: InferenceProxyDeps): ProxySupervisor {
  const log: ProxyLogger =
    typeof deps.logger === "function" ? { info: deps.logger, warn: deps.logger } : (deps.logger ?? createPluginLogger("paseo-remote-power", { subsystem: "inference-proxy" }));
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? defaultSleep;
  const active = new Map<string, ActiveProxy>();
  let stopped = false;

  function warn(message: string): void {
    log.warn(message);
  }

  async function runHoldAfterWake(host: HostRecord): Promise<void> {
    if (!host.holdCommand) return;
    try {
      await runCommand(host.holdCommand, host);
    } catch (cause) {
      warn(`inference-proxy: hold command for '${host.name}' failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  function forwardOnce(
    host: HostRecord,
    req: IncomingMessage,
    res: ServerResponse,
    body: Buffer,
    isClientGone: () => boolean,
  ): Promise<ForwardOutcome> {
    return new Promise((resolve) => {
      const proxy = host.inferenceProxy;
      if (!proxy) {
        resolve("done");
        return;
      }
      const upstreamHost = proxy.upstreamHost ?? DEFAULT_PROXY_UPSTREAM_HOST;
      let flushed = false;
      let responseStarted = false;
      let settled = false;
      const settle = (outcome: ForwardOutcome) => {
        if (settled) return;
        settled = true;
        res.removeListener("close", onClientClose);
        resolve(outcome);
      };
      const onClientClose = () => {
        if (settled) return;
        upstreamReq.destroy();
        settle("client-gone");
      };

      const upstreamReq = httpRequest(
        {
          host: upstreamHost,
          port: proxy.upstreamPort,
          method: req.method ?? "GET",
          path: req.url ?? "/",
          headers: filteredHeaders(req.headers, upstreamHost, proxy.upstreamPort, body.length),
        },
        (upstreamRes) => {
          responseStarted = true;
          if (isClientGone()) {
            upstreamRes.destroy();
            settle("client-gone");
            return;
          }
          res.writeHead(upstreamRes.statusCode ?? 502, filteredResponseHeaders(upstreamRes.headers));
          upstreamRes.pipe(res);
          upstreamRes.on("end", () => settle("done"));
          upstreamRes.on("error", (cause) => {
            log.warn(`inference-proxy: upstream response for '${host.name}' errored: ${cause.message}`);
            if (!res.writableEnded) res.destroy();
            settle("done");
          });
          upstreamRes.on("aborted", () => {
            if (!res.writableEnded) res.destroy();
            settle("done");
          });
        },
      );

      upstreamReq.on("finish", () => {
        flushed = true;
      });
      upstreamReq.on("error", (cause: NodeJS.ErrnoException) => {
        if (responseStarted) {
          if (!res.writableEnded) res.destroy();
          settle("done");
          return;
        }
        if (isClientGone()) {
          settle("client-gone");
          return;
        }
        // Before the request bytes were flushed this is a connect-class
        // failure (ECONNREFUSED/ECONNRESET/ETIMEDOUT/EAI_AGAIN/…): the host
        // never saw the request, so waking and retrying is safe. After the
        // flush the host may be mid-generation — never resend.
        if (!flushed) settle("retryable");
        else settle("midrequest");
        void cause;
      });

      res.on("close", onClientClose);
      if (body.length > 0) upstreamReq.end(body);
      else upstreamReq.end();
    });
  }

  async function handleRequest(getHost: () => HostRecord, req: IncomingMessage, res: ServerResponse): Promise<void> {
    let clientGone = false;
    res.on("close", () => {
      clientGone = true;
    });
    const isClientGone = () => clientGone || res.destroyed || res.writableEnded;

    try {
      // Buffer the body (capped) so a wake-retry can replay it verbatim.
      const chunks: Buffer[] = [];
      let total = 0;
      let tooLarge = false;
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        total += buf.length;
        if (total > MAX_PROXY_BODY_BYTES) {
          // Over the cap: keep draining so the 413 can be delivered cleanly,
          // but retain nothing further.
          tooLarge = true;
          continue;
        }
        chunks.push(buf);
      }
      if (tooLarge) {
        sendJson(res, 413, errorBody("request body too large", "request_too_large"));
        return;
      }
      if (isClientGone()) return;
      const body = Buffer.concat(chunks);

      const host = getHost();
      const proxy = host.inferenceProxy;
      if (!proxy) {
        sendJson(res, 502, errorBody(`${host.name} has no inference proxy configured`, "host_offline_midrequest"));
        return;
      }

      const first = await forwardOnce(host, req, res, body, isClientGone);
      if (first === "done" || first === "client-gone") return;
      if (first === "midrequest") {
        sendJson(res, 502, errorBody(`${host.name} went offline mid-request`, "host_offline_midrequest"));
        return;
      }

      // Wake path: one wake (the engine dedupes), then retry on the poll
      // cadence until the deadline measured from wake-path entry.
      const wakeTimeoutSeconds = proxy.wakeTimeoutSeconds ?? DEFAULT_PROXY_WAKE_TIMEOUT_SECONDS;
      const pollSeconds = proxy.pollSeconds ?? DEFAULT_PROXY_POLL_SECONDS;
      const deadline = now() + wakeTimeoutSeconds * 1000;
      log.info(`inference-proxy: '${host.name}' unreachable — waking (timeout ${wakeTimeoutSeconds}s)`);
      try {
        await deps.startWake(getHost());
      } catch (cause) {
        warn(`inference-proxy: startWake for '${host.name}' failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }

      for (;;) {
        if (isClientGone()) return;
        const remaining = deadline - now();
        if (remaining <= 0) break;
        await sleep(Math.min(pollSeconds * 1000, remaining));
        if (isClientGone()) return;
        if (now() >= deadline) break;
        const current = getHost();
        const outcome = await forwardOnce(current, req, res, body, isClientGone);
        if (outcome === "done") {
          // Fire-and-forget: the reply is already streaming; a hold failure
          // is logged by runHoldAfterWake and never touches the response.
          void runHoldAfterWake(current);
          return;
        }
        if (outcome === "client-gone") return;
        if (outcome === "midrequest") {
          sendJson(res, 502, errorBody(`${current.name} went offline mid-request`, "host_offline_midrequest"));
          return;
        }
        // retryable: loop until the deadline.
      }

      const latest = getHost();
      const timeout = latest.inferenceProxy?.wakeTimeoutSeconds ?? DEFAULT_PROXY_WAKE_TIMEOUT_SECONDS;
      sendJson(res, 503, errorBody(`${latest.name} is asleep and did not wake within ${timeout}s`, "host_asleep"));
    } catch (cause) {
      warn(`inference-proxy: request for '${getHost().name}' failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      if (!res.headersSent && !res.writableEnded && !res.destroyed) {
        sendJson(res, 502, errorBody(`${getHost().name} went offline mid-request`, "host_offline_midrequest"));
      } else if (!res.writableEnded && !res.destroyed) {
        res.destroy();
      }
    }
  }

  function closeServer(entry: ActiveProxy): Promise<void> {
    return new Promise((resolve) => {
      try {
        const maybeCloseAll = entry.server as Server & { closeAllConnections?: () => void };
        maybeCloseAll.closeAllConnections?.();
      } catch {
        // best effort
      }
      entry.server.close(() => resolve());
    });
  }

  return {
    async sync(hosts: HostRecord[]): Promise<void> {
      if (stopped) return;
      const wanted = new Map<string, HostRecord>();
      for (const host of hosts) {
        if (host.inferenceProxy) wanted.set(host.id, host);
      }

      // Remove proxies for hosts that vanished or lost their proxy config.
      for (const [id, entry] of [...active.entries()]) {
        const next = wanted.get(id);
        if (!next?.inferenceProxy) {
          active.delete(id);
          await closeServer(entry);
          continue;
        }
        const configKey = JSON.stringify(next.inferenceProxy);
        if (configKey !== entry.configKey) {
          active.delete(id);
          await closeServer(entry);
        } else {
          // Same listener: refresh the record so renames/hold changes apply.
          entry.host = next;
        }
      }

      for (const host of wanted.values()) {
        if (active.has(host.id) || !host.inferenceProxy) continue;
        const proxy = host.inferenceProxy;
        const entry: ActiveProxy = {
          host,
          configKey: JSON.stringify(proxy),
          server: null as unknown as Server,
        };
        const server = createServer((req, res) => {
          void handleRequest(() => entry.host, req, res);
        });
        entry.server = server;
        // Long generations must not be cut by server-side timeouts.
        server.requestTimeout = 0;
        server.headersTimeout = 0;
        server.timeout = 0;
        active.set(host.id, entry);
        try {
          await new Promise<void>((resolve, reject) => {
            const onError = (cause: Error) => {
              server.removeListener("listening", onListening);
              reject(cause);
            };
            const onListening = () => {
              server.removeListener("error", onError);
              resolve();
            };
            server.once("error", onError);
            server.once("listening", onListening);
            server.listen(proxy.listenPort, "127.0.0.1");
          });
          log.info(`inference-proxy: '${host.name}' listening on 127.0.0.1:${proxy.listenPort} -> ${proxy.upstreamHost ?? DEFAULT_PROXY_UPSTREAM_HOST}:${proxy.upstreamPort}`);
          server.on("error", (cause) => {
            warn(`inference-proxy: listener for '${entry.host.name}' on 127.0.0.1:${proxy.listenPort} failed: ${cause.message}`);
            if (active.get(host.id) === entry) active.delete(host.id);
          });
        } catch (cause) {
          // EADDRINUSE and friends: log and continue — sync() never throws.
          if (active.get(host.id) === entry) active.delete(host.id);
          warn(
            `inference-proxy: could not listen on 127.0.0.1:${proxy.listenPort} for '${host.name}': ${cause instanceof Error ? cause.message : String(cause)}`,
          );
          try {
            server.close();
          } catch {
            // never listened
          }
        }
      }
    },

    async stop(): Promise<void> {
      stopped = true;
      const entries = [...active.values()];
      active.clear();
      await Promise.all(entries.map((entry) => closeServer(entry)));
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton used by index.server.ts / handlers.ts
// ---------------------------------------------------------------------------

let singleton: ProxySupervisor | null = null;
let singletonDeps: InferenceProxyDeps | null = null;

function defaultSingletonDeps(): InferenceProxyDeps {
  const engine = createWakeEngine({ settings: () => engineSettingsFrom(readSettings()) });
  return {
    startWake: (host) => engine.startWake(host),
    loadHostsFn: () => loadHosts(),
  };
}

export async function syncInferenceProxies(deps?: InferenceProxyDeps): Promise<void> {
  try {
    if (deps) singletonDeps = deps;
    if (!singleton) {
      singleton = createProxySupervisor(singletonDeps ?? defaultSingletonDeps());
    }
    const load = singletonDeps?.loadHostsFn ?? deps?.loadHostsFn ?? (() => loadHosts());
    await singleton.sync(load());
  } catch (cause) {
    // Proxy supervision must never break host mutations or plugin startup.
    try {
      createPluginLogger("paseo-remote-power", { subsystem: "inference-proxy" }).warn(
        `syncInferenceProxies failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } catch {
      // logging is best effort
    }
  }
}

export async function stopInferenceProxies(): Promise<void> {
  const current = singleton;
  singleton = null;
  singletonDeps = null;
  if (current) {
    try {
      await current.stop();
    } catch {
      // shutdown is best effort
    }
  }
}
