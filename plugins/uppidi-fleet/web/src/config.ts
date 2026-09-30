export const DEFAULT_DAEMON_HOST = "10.20.30.24:6767";
export const DEFAULT_HTTP_PORT_FALLBACK = 6767;

function readProcessEnv(name: string): string | undefined {
  const holder = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  const value = holder.process?.env?.[name];
  return typeof value === "string" ? value : undefined;
}

function readEnv(name: string): string | undefined {
  const fromImportMeta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[name];
  for (const candidate of [fromImportMeta, readProcessEnv(name)]) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function resolveDaemonHost(): string {
  return readEnv("VITE_PASEO_DAEMON_HOST") ?? DEFAULT_DAEMON_HOST;
}

function ensureWsUrl(raw: string): string {
  const trimmed = raw.trim();
  let withScheme = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    withScheme = trimmed.replace(/^http/i, "ws");
  } else if (!/^wss?:\/\//i.test(trimmed)) {
    withScheme = `ws://${trimmed}`;
  }

  try {
    const parsed = new URL(withScheme);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/ws";
    } else if (parsed.pathname === "/ws/") {
      parsed.pathname = "/ws";
    } else if (parsed.pathname.endsWith("/ws/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    if (withScheme.endsWith("/ws")) return withScheme;
    if (withScheme.endsWith("/ws/")) return withScheme.slice(0, -1);
    if (withScheme.endsWith("/")) return `${withScheme}ws`;
    return `${withScheme}/ws`;
  }
}

export function resolveDaemonWsUrl(host?: string): string {
  const explicit = readEnv("VITE_PASEO_DAEMON_URL");
  const target = explicit ?? host ?? resolveDaemonHost();
  return ensureWsUrl(target);
}

export function resolveDaemonHttpUrl(host?: string): string {
  const ws = resolveDaemonWsUrl(host);
  let http: string;
  if (ws.startsWith("wss://")) {
    http = `https://${ws.slice("wss://".length)}`;
  } else if (ws.startsWith("ws://")) {
    http = `http://${ws.slice("ws://".length)}`;
  } else {
    http = ws;
  }

  try {
    const parsed = new URL(http);
    let p = parsed.pathname;
    if (p === "/ws" || p === "/ws/") {
      p = "";
    } else if (p.endsWith("/ws/")) {
      p = p.slice(0, -"/ws/".length);
    } else if (p.endsWith("/ws")) {
      p = p.slice(0, -"/ws".length);
    }
    const pathPart = p === "/" ? "" : p;
    return `${parsed.origin}${pathPart}${parsed.search}${parsed.hash}`;
  } catch {
    return http.replace(/\/ws\/?([?#]|$)/, "$1").replace(/\/$/, "");
  }
}

export function resolveDaemonToken(): string | undefined {
  return readEnv("VITE_PASEO_DAEMON_TOKEN") ?? loadStoredDaemonToken();
}

const DAEMON_TOKEN_STORAGE_KEY = "uppidi-fleet.daemon-token";

function storage(): Storage | null {
  try {
    const holder = globalThis as unknown as { localStorage?: Storage };
    return holder.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadStoredDaemonToken(): string | undefined {
  try {
    const value = storage()?.getItem(DAEMON_TOKEN_STORAGE_KEY);
    return value ? value : undefined;
  } catch {
    return undefined;
  }
}

export function storeDaemonToken(token: string | undefined): void {
  const store = storage();
  if (!store) return;
  try {
    if (token) store.setItem(DAEMON_TOKEN_STORAGE_KEY, token);
    else store.removeItem(DAEMON_TOKEN_STORAGE_KEY);
  } catch {
    // Private-mode storage may throw; the token simply won't persist.
  }
}

/** Split `host:port` without breaking bare IPv6 or `host` without a port. */
export function splitHostPort(hostport: string): { host: string; port: number } {
  const trimmed = hostport.trim();
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) {
    return { host: bracketed[1]!, port: Number(bracketed[2] ?? DEFAULT_HTTP_PORT_FALLBACK) };
  }
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon > 0 && trimmed.indexOf(":") === lastColon) {
    const port = Number(trimmed.slice(lastColon + 1));
    if (Number.isInteger(port) && port > 0) {
      return { host: trimmed.slice(0, lastColon), port };
    }
  }
  return { host: trimmed, port: DEFAULT_HTTP_PORT_FALLBACK };
}
