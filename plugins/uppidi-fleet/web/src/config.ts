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

export function resolveDaemonWsUrl(host?: string): string {
  const explicit = readEnv("VITE_PASEO_DAEMON_URL");
  if (explicit) return explicit;
  const target = (host ?? resolveDaemonHost()).trim();
  if (/^wss?:\/\//i.test(target)) return target;
  return `ws://${target}`;
}

export function resolveDaemonHttpUrl(host?: string): string {
  const ws = resolveDaemonWsUrl(host);
  if (ws.startsWith("wss://")) return `https://${ws.slice("wss://".length)}`;
  if (ws.startsWith("ws://")) return `http://${ws.slice("ws://".length)}`;
  return ws;
}

export function resolveDaemonToken(): string | undefined {
  return readEnv("VITE_PASEO_DAEMON_TOKEN");
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
