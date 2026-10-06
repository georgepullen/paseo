import { randomUUID } from "node:crypto";
import { PluginStorage } from "paseo-plugin-helper/server";
import { z } from "zod";
import {
  HostRecordSchema,
  type HostRecord,
  type WakeTransport,
} from "../shared/registry.ts";

/**
 * Hosts registry and bearer-token store for remote power control.
 *
 * Both live ONLY in the plugin state dir
 * (~/.paseo/plugin-data/xpufx/paseo-remote-power/) via PluginStorage — never in
 * the repo, never in any config the plugin ships. Host records carry a
 * `tokenRef` naming a key in tokens.json; the secret material itself never
 * touches a host record, an RPC output, or the MCP tools.
 *
 * A fresh store instance per call keeps paths honest under test HOME
 * sandboxing (the same rule plugins/x-comms applies to its registry).
 */

export interface HostsFile {
  hosts: HostRecord[];
}

const HostsFileSchema = z.object({ hosts: z.array(HostRecordSchema) });
const TokensFileSchema = z.record(z.string(), z.string());

export function hostsStore(baseDir?: string) {
  return new PluginStorage<HostsFile>("paseo-remote-power", "hosts.json", {
    defaultData: { hosts: [] },
    ...(baseDir !== undefined ? { baseDir } : {}),
  });
}

export function tokensStore(baseDir?: string) {
  return new PluginStorage<Record<string, string>>("paseo-remote-power", "tokens.json", {
    defaultData: {},
    ...(baseDir !== undefined ? { baseDir } : {}),
  });
}

/** The plugin state dir (hosts.json's directory). Used by the injector for the stable server install. */
export function stateDir(): string {
  return hostsStore().pluginDir;
}

export function loadHosts(baseDir?: string): HostRecord[] {
  try {
    const parsed = HostsFileSchema.safeParse(hostsStore(baseDir).read());
    return parsed.success ? parsed.data.hosts : [];
  } catch {
    return [];
  }
}

export function saveHosts(hosts: HostRecord[], baseDir?: string): void {
  hostsStore(baseDir).write({ hosts });
}

export function loadTokens(baseDir?: string): Record<string, string> {
  try {
    const parsed = TokensFileSchema.safeParse(tokensStore(baseDir).read());
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function saveTokens(tokens: Record<string, string>, baseDir?: string): void {
  tokensStore(baseDir).write(tokens);
}

export function resolveToken(ref: string | undefined, baseDir?: string): string | null {
  if (!ref) return null;
  return loadTokens(baseDir)[ref] ?? null;
}

export function findHost(id: string, baseDir?: string): HostRecord | null {
  return loadHosts(baseDir).find((host) => host.id === id) ?? null;
}

export interface AddHostInput {
  name: string;
  sshTarget?: string;
  statusCommand?: { command: string; args?: string[] };
  wakeWindowSeconds?: number;
  wakeTransports: WakeTransport[];
  token?: string;
  tokenRef?: string;
}

/**
 * Create a host record with a fresh id. When `token` is provided it is stored
 * under `tokenRef` (or a generated ref) and every http transport without an
 * explicit tokenRef is pointed at that ref.
 */
export function addHost(input: AddHostInput, baseDir?: string): { saved: boolean; error: string | null; host: HostRecord | null } {
  const name = input.name.trim();
  if (name.length === 0) return { saved: false, error: "host name is required", host: null };
  const now = Date.now();
  const draft: HostRecord = {
    id: `host-${randomUUID().slice(0, 8)}`,
    name,
    ...(input.sshTarget !== undefined ? { sshTarget: input.sshTarget.trim() } : {}),
    ...(input.statusCommand !== undefined ? { statusCommand: input.statusCommand } : {}),
    ...(input.wakeWindowSeconds !== undefined ? { wakeWindowSeconds: input.wakeWindowSeconds } : {}),
    wakeTransports: input.wakeTransports,
    createdAt: now,
    updatedAt: now,
  };
  const stored = storeToken(draft, input.token, input.tokenRef, baseDir);

  const parsed = HostRecordSchema.safeParse(stored);
  if (!parsed.success) {
    return { saved: false, error: firstIssue(parsed.error), host: null };
  }

  const hosts = loadHosts(baseDir);
  if (hosts.some((existing) => existing.name.toLowerCase() === name.toLowerCase())) {
    return { saved: false, error: `a host named '${name}' already exists`, host: null };
  }

  saveHosts([...hosts, parsed.data], baseDir);
  return { saved: true, error: null, host: parsed.data };
}

export interface UpdateHostInput {
  id: string;
  name?: string;
  sshTarget?: string | null;
  statusCommand?: { command: string; args?: string[] } | null;
  wakeWindowSeconds?: number | null;
  wakeTransports?: WakeTransport[];
  token?: string;
  tokenRef?: string;
}

export function updateHost(
  input: UpdateHostInput,
  baseDir?: string,
): { saved: boolean; error: string | null; host: HostRecord | null } {
  const hosts = loadHosts(baseDir);
  const index = hosts.findIndex((host) => host.id === input.id);
  if (index === -1) return { saved: false, error: `unknown host '${input.id}'`, host: null };

  const current = hosts[index];
  const draft: HostRecord = {
    ...current,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    // Explicit null clears an optional field; undefined leaves it alone.
    ...(input.sshTarget != null ? { sshTarget: input.sshTarget.trim() } : {}),
    ...(input.statusCommand != null ? { statusCommand: input.statusCommand } : {}),
    ...(input.wakeWindowSeconds != null ? { wakeWindowSeconds: input.wakeWindowSeconds } : {}),
    ...(input.wakeTransports !== undefined ? { wakeTransports: input.wakeTransports } : {}),
    updatedAt: Date.now(),
  };
  if (input.sshTarget === null) delete draft.sshTarget;
  if (input.statusCommand === null) delete draft.statusCommand;
  if (input.wakeWindowSeconds === null) delete draft.wakeWindowSeconds;
  const stored = storeToken(draft, input.token, input.tokenRef, baseDir);

  const parsed = HostRecordSchema.safeParse(stored);
  if (!parsed.success) return { saved: false, error: firstIssue(parsed.error), host: null };

  const next = [...hosts];
  next[index] = parsed.data;
  saveHosts(next, baseDir);
  return { saved: true, error: null, host: parsed.data };
}

export function removeHost(id: string, baseDir?: string): { saved: boolean; error: string | null } {
  const hosts = loadHosts(baseDir);
  const next = hosts.filter((host) => host.id !== id);
  if (next.length === hosts.length) return { saved: false, error: `unknown host '${id}'` };
  saveHosts(next, baseDir);
  return { saved: true, error: null };
}

/**
 * Store a bearer token under a ref and point every http transport of the host
 * that lacks a tokenRef at it. The secret only ever lands in tokens.json.
 * Returns the host draft with tokenRefs wired.
 */
function storeToken(
  host: HostRecord,
  token: string | undefined,
  tokenRef: string | undefined,
  baseDir?: string,
): HostRecord {
  if (token === undefined) return host;
  const ref = tokenRef?.trim() || `token-${host.id}`;
  const tokens = loadTokens(baseDir);
  tokens[ref] = token;
  saveTokens(tokens, baseDir);
  return {
    ...host,
    wakeTransports: host.wakeTransports.map((transport) =>
      transport.type === "http" && transport.tokenRef === undefined ? { ...transport, tokenRef: ref } : transport,
    ),
  };
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "invalid host record";
  const where = issue.path.length > 0 ? issue.path.join(".") : "host";
  return `${where}: ${issue.message}`;
}
