import { createPluginLogger } from "paseo-plugin-helper/server";
import type { RpcOutput } from "paseo-plugin-helper/shared";
import {
  hostStatusRpc,
  hostWakeRpc,
  hostsAddRpc,
  hostsListRpc,
  hostsRemoveRpc,
  jobStatusRpc,
  jobsListRpc,
  type HostRecord,
} from "../shared/registry.ts";
import { addHost, loadHosts, removeHost, updateHost } from "./registry.ts";
import { probeHost } from "./probe.ts";
import { readSettings, settingsStore, engineSettingsFrom, type PowerSettings } from "./settings.ts";
import { createWakeEngine, type WakeEngineDeps } from "./wake-engine.ts";

const log = createPluginLogger("paseo-remote-power", { subsystem: "handlers" });

export type HostsListResult = RpcOutput<typeof hostsListRpc>;
export type HostMutateResult = RpcOutput<typeof hostsAddRpc>;
export type HostRemoveResult = RpcOutput<typeof hostsRemoveRpc>;
export type HostStatusResult = RpcOutput<typeof hostStatusRpc>;
export type HostWakeResult = RpcOutput<typeof hostWakeRpc>;
export type JobStatusResult = RpcOutput<typeof jobStatusRpc>;
export type JobsListResult = RpcOutput<typeof jobsListRpc>;

/**
 * RPC handlers for the roster surface and the shared engine. The engine is
 * rebuilt per call (stores are fs-backed documents, so instances are cheap and
 * every handler observes fresh state); tests seam the primitives through
 * WakeEngineDeps, production runs on the defaults.
 */
function handlerEngine(deps?: WakeEngineDeps) {
  return createWakeEngine({ settings: () => engineSettingsFrom(readSettings()), ...deps });
}

export function handleHostsList(): HostsListResult {
  return { hosts: loadHosts() };
}

export function handleHostsAdd(input: {
  name: string;
  sshTarget?: string;
  statusCommand?: { command: string; args?: string[] };
  wakeWindowSeconds?: number;
  wakeTransports: HostRecord["wakeTransports"];
  token?: string;
  tokenRef?: string;
}): HostMutateResult {
  const result = addHost(input);
  if (!result.saved) log.warn(`hosts.add rejected: ${result.error}`);
  return { ...result, hosts: loadHosts() };
}

export function handleHostsUpdate(input: {
  id: string;
  name?: string;
  sshTarget?: string | null;
  statusCommand?: { command: string; args?: string[] } | null;
  wakeWindowSeconds?: number | null;
  wakeTransports?: HostRecord["wakeTransports"];
  token?: string;
  tokenRef?: string;
}): HostMutateResult {
  const result = updateHost(input);
  if (!result.saved) log.warn(`hosts.update rejected: ${result.error}`);
  return { ...result, hosts: loadHosts() };
}

export function handleHostsRemove(input: { id: string }): HostRemoveResult {
  const result = removeHost(input.id);
  if (!result.saved) log.warn(`hosts.remove rejected: ${result.error}`);
  return { ...result, hosts: loadHosts() };
}

export async function handleHostStatus(input: { id: string }): Promise<HostStatusResult> {
  const host = loadHosts().find((entry) => entry.id === input.id);
  const checkedAt = Date.now();
  if (!host) {
    return { id: input.id, state: "unknown", probedVia: "none", error: `unknown host '${input.id}'`, checkedAt };
  }
  try {
    const { state, probedVia } = await probeHost(host, { timeoutSeconds: readSettings().probeTimeoutSeconds });
    log.info(`host '${host.id}' probe: ${state} via ${probedVia}`);
    return { id: host.id, state, probedVia, error: null, checkedAt };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { id: host.id, state: "unknown", probedVia: "none", error: message, checkedAt };
  }
}

export async function handleHostWake(input: { id: string }): Promise<HostWakeResult> {
  const host = loadHosts().find((entry) => entry.id === input.id);
  if (!host) {
    return {
      accepted: false,
      jobId: null,
      status: "failed",
      alreadyUp: false,
      error: { mode: "unknown-host", message: `unknown host '${input.id}'` },
    };
  }
  return handlerEngine().startWake(host);
}

export function handleJobStatus(input: { jobId: string }): JobStatusResult {
  return { job: handlerEngine().job(input.jobId) };
}

export function handleJobsList(): JobsListResult {
  return { jobs: handlerEngine().jobs() };
}

// Settings contract handlers (registered under powerSettingsContract.get/.update/.reset,
// the same shape plugins/top serves its settings screen from).

export function handleGetSettings(): PowerSettings {
  return readSettings();
}

export function handleUpdateSettings(patch: Partial<PowerSettings>): PowerSettings {
  settingsStore().write({ ...readSettings(), ...patch });
  return readSettings();
}

export function handleResetSettings(): PowerSettings {
  settingsStore().reset();
  return readSettings();
}
