import { spawn } from "node:child_process";
import type { HostRecord } from "../shared/registry.ts";

/**
 * Reachability probes, ported from the wake script this plugin generalizes:
 * ssh with BatchMode and a bounded ConnectTimeout (`ssh -o BatchMode=yes -o
 * ConnectTimeout=<n> <target> true`), or a custom status command that reports
 * liveness by exiting zero. A host with neither configured reports "unknown"
 * — no opinion is not a guess.
 */

export type ProbeState = "up" | "down" | "unknown";
export type ProbeChannel = "statusCommand" | "ssh" | "none";

export const DEFAULT_PROBE_TIMEOUT_SECONDS = 8;
/** Grace beyond the child's own timeout before we give up waiting on the process. */
const SPAWN_GRACE_MS = 2000;

/** The process-spawning seam, so tests drive probes over fake children. */
export type SpawnFn = (
  command: string,
  args: string[],
  timeoutMs: number,
) => Promise<{ code: number | null }>;

export const realSpawn: SpawnFn = (command, args, timeoutMs) => {
  let resolve!: (value: { code: number | null }) => void;
  const promise = new Promise<{ code: number | null }>((r) => {
    resolve = r;
  });
  const child = spawn(command, args, { timeout: timeoutMs, stdio: "ignore" });
  child.on("exit", (code) => resolve({ code }));
  child.on("error", () => resolve({ code: null }));
  return promise;
};

export interface ProbeOptions {
  timeoutSeconds?: number;
  spawnImpl?: SpawnFn;
}

async function runUntilExit(spawnImpl: SpawnFn, command: string, args: string[], timeoutMs: number): Promise<boolean> {
  try {
    const result = await spawnImpl(command, args, timeoutMs);
    return result.code === 0;
  } catch {
    // A crashing spawn is a failed probe, not a crash of the prober: report down.
    return false;
  }
}

/**
 * Probe one host now. `statusCommand` wins over `sshTarget` when both are
 * configured; with neither, the state is "unknown".
 */
export async function probeHost(host: HostRecord, options: ProbeOptions = {}): Promise<{ state: ProbeState; probedVia: ProbeChannel }> {
  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_PROBE_TIMEOUT_SECONDS;
  const spawnImpl = options.spawnImpl ?? realSpawn;
  const timeoutMs = timeoutSeconds * 1000 + SPAWN_GRACE_MS;

  if (host.statusCommand) {
    const up = await runUntilExit(spawnImpl, host.statusCommand.command, host.statusCommand.args ?? [], timeoutMs);
    return { state: up ? "up" : "down", probedVia: "statusCommand" };
  }
  if (host.sshTarget) {
    // Same shape the source script verified with: a bare `true` over BatchMode
    // ssh, so key auth from the daemon host is the only requirement.
    const up = await runUntilExit(
      spawnImpl,
      "ssh",
      ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${timeoutSeconds}`, host.sshTarget, "true"],
      timeoutMs,
    );
    return { state: up ? "up" : "down", probedVia: "ssh" };
  }
  return { state: "unknown", probedVia: "none" };
}

/** Boolean convenience for the wake engine's verification loop. */
export async function probeReachable(host: HostRecord, options: ProbeOptions = {}): Promise<boolean> {
  const { state } = await probeHost(host, options);
  return state === "up";
}
