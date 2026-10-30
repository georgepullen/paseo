import { createPluginLogger } from "paseo-plugin-helper/server";
import type { HostRecord } from "../shared/registry.ts";
import { loadHosts } from "./registry.ts";
import { createWakeEngine } from "./wake-engine.ts";
import { engineSettingsFrom, readSettings } from "./settings.ts";
import { defaultRunCommand, type ProxyLogger, type RunCommandFn } from "./inference-proxy.ts";

/**
 * Per-host agent keep-awake hold. While a local Paseo agent whose model
 * matches one of a host's `agentModels` prefixes is in an active turn, the
 * host's `holdCommand` runs immediately (with one wake) and then every
 * HOLD_REFRESH_MS — e.g. an ssh touch refreshing a 3600s wake-hold file, so
 * a 600s cadence is comfortably inside the TTL. A 60s reconcile against
 * `paseo.agents.list()` repairs any missed turn events.
 */

export const HOLD_REFRESH_MS = 600_000;
export const RECONCILE_MS = 60_000;

export interface AgentSnapshotLike {
  id?: string | null;
  model?: string | null;
  status?: string | null;
  activeTurn?: unknown;
}

export interface PaseoAgentsLike {
  agents?: {
    list?: (...args: unknown[]) => Promise<unknown>;
    ref?: (agentId: string) => {
      current?: () => unknown;
      refresh?: () => Promise<unknown>;
    } | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AgentHoldTimers {
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export interface AgentHoldDeps {
  loadHostsFn?: () => HostRecord[] | Promise<HostRecord[]>;
  fetchAgent?: (agentId: string, paseo: PaseoAgentsLike | undefined) => Promise<AgentSnapshotLike | null>;
  listAgents?: (paseo: PaseoAgentsLike | undefined) => Promise<AgentSnapshotLike[]>;
  startWake?: (host: HostRecord) => Promise<unknown>;
  runCommand?: RunCommandFn;
  logger?: ProxyLogger | ((message: string) => void);
  timers?: AgentHoldTimers;
  holdRefreshMs?: number;
  reconcileMs?: number;
}

export interface AgentHoldTracker {
  turnStarted(agentId: string, paseo?: PaseoAgentsLike): Promise<void>;
  turnEnded(agentId: string): void;
  reconcile(paseo?: PaseoAgentsLike): Promise<void>;
  stop(): void;
}

const defaultTimers: AgentHoldTimers = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as Parameters<typeof clearInterval>[0]),
};

function snapshotCandidate(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const nested = record["agent"] ?? record["info"];
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return record;
}

function normalizeSnapshot(raw: unknown): AgentSnapshotLike | null {
  const candidate = snapshotCandidate(raw);
  if (!candidate) return null;
  const wrapper = raw as Record<string, unknown>;
  return {
    id: (candidate["id"] as string | undefined) ?? (wrapper["agentId"] as string | undefined) ?? null,
    model: (candidate["model"] as string | null | undefined) ?? null,
    status: (candidate["status"] as string | null | undefined) ?? null,
    activeTurn: candidate["activeTurn"] ?? null,
  };
}

function normalizeList(raw: unknown): AgentSnapshotLike[] {
  let entries: unknown[] = [];
  if (Array.isArray(raw)) entries = raw;
  else if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record["entries"])) entries = record["entries"];
    else if (Array.isArray(record["agents"])) entries = record["agents"];
    else if (Array.isArray(record["snapshots"])) entries = record["snapshots"];
  }
  const out: AgentSnapshotLike[] = [];
  for (const entry of entries) {
    const normalized = normalizeSnapshot(entry);
    if (normalized) out.push(normalized);
  }
  return out;
}

async function defaultListAgents(paseo: PaseoAgentsLike | undefined): Promise<AgentSnapshotLike[]> {
  const list = paseo?.agents?.list;
  if (typeof list !== "function") return [];
  return normalizeList(await list.call(paseo?.agents));
}

async function defaultFetchAgent(agentId: string, paseo: PaseoAgentsLike | undefined): Promise<AgentSnapshotLike | null> {
  const agents = paseo?.agents;
  if (agents && typeof agents.ref === "function") {
    try {
      const handle = agents.ref(agentId);
      let raw: unknown = typeof handle?.current === "function" ? handle.current() : null;
      if (!raw && typeof handle?.refresh === "function") {
        const refreshed: unknown = await handle.refresh();
        raw =
          refreshed && typeof refreshed === "object" && "agent" in (refreshed as Record<string, unknown>)
            ? (refreshed as Record<string, unknown>)["agent"]
            : (refreshed ?? (typeof handle.current === "function" ? handle.current() : null));
      }
      const normalized = normalizeSnapshot(raw);
      if (normalized) return normalized;
    } catch {
      // fall through to the list lookup
    }
  }
  const all = await defaultListAgents(paseo);
  return all.find((entry) => entry.id === agentId) ?? null;
}

interface HostHoldState {
  host: HostRecord;
  agents: Set<string>;
  timer: unknown;
}

export function createAgentHoldTracker(deps: AgentHoldDeps = {}): AgentHoldTracker {
  const log: ProxyLogger =
    typeof deps.logger === "function" ? { info: deps.logger, warn: deps.logger } : (deps.logger ?? createPluginLogger("paseo-remote-power", { subsystem: "agent-hold" }));
  const loadHostsFn = deps.loadHostsFn ?? (() => loadHosts());
  const fetchAgent = deps.fetchAgent ?? defaultFetchAgent;
  const listAgents = deps.listAgents ?? defaultListAgents;
  const startWake =
    deps.startWake ??
    (() => {
      const engine = createWakeEngine({ settings: () => engineSettingsFrom(readSettings()) });
      return (host: HostRecord) => engine.startWake(host);
    })();
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const timers = deps.timers ?? defaultTimers;
  const holdRefreshMs = deps.holdRefreshMs ?? HOLD_REFRESH_MS;
  const reconcileMs = deps.reconcileMs ?? RECONCILE_MS;

  const hosts = new Map<string, HostHoldState>();
  let capturedPaseo: PaseoAgentsLike | undefined;
  let reconcileTimer: unknown = null;
  let stopped = false;

  function clearHostTimer(state: HostHoldState): void {
    if (state.timer !== null && state.timer !== undefined) {
      try {
        timers.clearInterval(state.timer);
      } catch {
        // fake/foreign handles are best effort
      }
      state.timer = null;
    }
  }

  async function runHold(host: HostRecord): Promise<void> {
    if (!host.holdCommand) return;
    try {
      await runCommand(host.holdCommand, host);
    } catch (cause) {
      log.warn(`agent-hold: hold command for '${host.name}' failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async function activate(host: HostRecord): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    jobs.push(
      Promise.resolve()
        .then(() => startWake(host))
        .catch((cause: unknown) => {
          log.warn(`agent-hold: wake for '${host.name}' failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        }),
    );
    if (host.holdCommand) jobs.push(runHold(host));
    await Promise.all(jobs);
  }

  function startRefreshTimer(state: HostHoldState): void {
    if (state.timer !== null && state.timer !== undefined) return;
    const timer = timers.setInterval(() => {
      void (async () => {
        try {
          const current = hosts.get(state.host.id);
          if (!current || current.agents.size === 0) return;
          let fresh = current.host;
          try {
            const loaded = await loadHostsFn();
            fresh = loaded.find((entry) => entry.id === state.host.id) ?? fresh;
            current.host = fresh;
          } catch {
            // keep the last known record
          }
          await runHold(fresh);
        } catch (cause) {
          log.warn(`agent-hold: refresh for '${state.host.name}' failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      })();
    }, holdRefreshMs);
    state.timer = timer;
    const maybeUnref = timer as { unref?: () => void } | null;
    if (maybeUnref && typeof maybeUnref === "object" && typeof maybeUnref.unref === "function") maybeUnref.unref();
  }

  async function addAgent(host: HostRecord, agentId: string, activations: Promise<void>[]): Promise<void> {
    let state = hosts.get(host.id);
    if (!state) {
      state = { host, agents: new Set<string>(), timer: null };
      hosts.set(host.id, state);
    }
    state.host = host;
    if (state.agents.has(agentId)) return;
    const wasEmpty = state.agents.size === 0;
    state.agents.add(agentId);
    if (wasEmpty) {
      startRefreshTimer(state);
      activations.push(activate(host));
    }
  }

  function removeAgentFromHost(hostId: string, agentId: string): void {
    const state = hosts.get(hostId);
    if (!state || !state.agents.delete(agentId)) return;
    if (state.agents.size === 0) {
      clearHostTimer(state);
      hosts.delete(hostId);
    }
  }

  function removeAgentEverywhere(agentId: string): void {
    for (const hostId of [...hosts.keys()]) removeAgentFromHost(hostId, agentId);
  }

  function capturePaseo(paseo: PaseoAgentsLike | undefined): void {
    if (stopped) return;
    if (paseo && !capturedPaseo) capturedPaseo = paseo;
    if (!capturedPaseo || reconcileTimer !== null) return;
    const timer = timers.setInterval(() => {
      void reconcile(capturedPaseo);
    }, reconcileMs);
    reconcileTimer = timer;
    const maybeUnref = timer as { unref?: () => void } | null;
    if (maybeUnref && typeof maybeUnref === "object" && typeof maybeUnref.unref === "function") maybeUnref.unref();
  }

  async function reconcile(paseo?: PaseoAgentsLike): Promise<void> {
    try {
      if (stopped) return;
      capturePaseo(paseo);
      const effectivePaseo = paseo ?? capturedPaseo;
      const [allHosts, snapshots] = await Promise.all([
        Promise.resolve(loadHostsFn()),
        Promise.resolve(listAgents(effectivePaseo)),
      ]);
      const desired = new Map<string, { host: HostRecord; agents: Set<string> }>();
      for (const snapshot of snapshots) {
        if (!snapshot.id) continue;
        for (const host of allHosts) {
          if (!hostMatchesSnapshot(host, snapshot)) continue;
          let entry = desired.get(host.id);
          if (!entry) {
            entry = { host, agents: new Set<string>() };
            desired.set(host.id, entry);
          }
          entry.agents.add(snapshot.id);
        }
      }

      const activations: Promise<void>[] = [];
      // Drop finished/stale agents (and hosts that no longer match at all).
      for (const [hostId, state] of [...hosts.entries()]) {
        const wanted = desired.get(hostId);
        for (const agentId of [...state.agents]) {
          if (!wanted || !wanted.agents.has(agentId)) removeAgentFromHost(hostId, agentId);
        }
      }
      // Add missed agents.
      for (const { host, agents } of desired.values()) {
        for (const agentId of agents) {
          await addAgent(host, agentId, activations);
        }
      }
      await Promise.all(activations);
    } catch (cause) {
      log.warn(`agent-hold: reconcile failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  function hostMatchesSnapshot(host: HostRecord, snapshot: AgentSnapshotLike): boolean {
    const prefixes = host.agentModels;
    if (!prefixes || prefixes.length === 0) return false;
    if (!snapshot.model) return false;
    if (!prefixes.some((prefix) => snapshot.model!.startsWith(prefix))) return false;
    return snapshot.status === "running" || snapshot.status === "initializing" || (snapshot.activeTurn !== null && snapshot.activeTurn !== undefined);
  }

  return {
    async turnStarted(agentId: string, paseo?: PaseoAgentsLike): Promise<void> {
      try {
        if (stopped || !agentId) return;
        capturePaseo(paseo);
        const snapshot = await fetchAgent(agentId, paseo ?? capturedPaseo);
        if (!snapshot) return;
        const allHosts = await loadHostsFn();
        const activations: Promise<void>[] = [];
        for (const host of allHosts) {
          if (hostMatchesSnapshot(host, snapshot)) await addAgent(host, agentId, activations);
        }
        await Promise.all(activations);
      } catch (cause) {
        log.warn(`agent-hold: turnStarted for '${agentId}' failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    },

    turnEnded(agentId: string): void {
      try {
        if (!agentId) return;
        removeAgentEverywhere(agentId);
      } catch (cause) {
        log.warn(`agent-hold: turnEnded for '${agentId}' failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    },

    reconcile,

    stop(): void {
      stopped = true;
      if (reconcileTimer !== null && reconcileTimer !== undefined) {
        try {
          timers.clearInterval(reconcileTimer);
        } catch {
          // best effort
        }
        reconcileTimer = null;
      }
      for (const state of hosts.values()) clearHostTimer(state);
      hosts.clear();
    },
  };
}
