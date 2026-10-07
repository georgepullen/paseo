import { randomUUID } from "node:crypto";
import { createPluginLogger, PluginStorage } from "paseo-plugin-helper/server";
import { z } from "zod";
import {
  ACTIVE_JOB_STATUSES,
  JobRecordSchema,
  type HostRecord,
  type JobRecord,
  type JobStatus,
  type WakeTransport,
} from "../shared/registry.ts";
import { probeReachable, realSpawn } from "./probe.ts";
import { sendMagicPacket } from "./wol.ts";
import {
  MICROLINK_DEFAULT_PORT,
  MICROLINK_DEFAULT_SCHEME,
  sendWakeHttp,
  sendWakeUdp,
} from "./microlink.ts";
import { resolveToken } from "./registry.ts";

/**
 * Wake engine — the ordered-transport state machine ported from the wake
 * script this plugin generalizes:
 *
 *   starting → waking → verifying → up | failed
 *
 * Transports run in configured order with fallback on failure. After the first
 * transport accepts the wake, the engine polls reachability (ssh BatchMode or
 * the host's custom status command) every WAKE_POLL_INTERVAL_MS until the host
 * is up or the wake window (default 110s) expires. Two distinct failure modes,
 * straight from the source script: "no usable wake transport" (every transport
 * failed) and "wake accepted but the host never became reachable".
 *
 * Wakes are idempotent: a probe that already reports up starts no job. A host
 * with a wake already in flight returns that job instead of stacking a second.
 *
 * Jobs persist to the state dir (jobs.json) so the embedded MCP server — a
 * separate process — sees the same job history the plugin server does.
 */

const engineLog = createPluginLogger("paseo-remote-power", { subsystem: "wake-engine" });

export const WAKE_POLL_INTERVAL_MS = 3_000;
export const DEFAULT_WAKE_WINDOW_SECONDS = 110;
export const TRANSPORT_TIMEOUT_MS = 30_000;
const MAX_JOBS = 100;
const JOBS_RETENTION_MS = 60 * 60 * 1000;

export interface EngineSettings {
  defaultWakeWindowSeconds: number;
  probeTimeoutSeconds: number;
  maxConcurrentWakes: number;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  defaultWakeWindowSeconds: DEFAULT_WAKE_WINDOW_SECONDS,
  probeTimeoutSeconds: 8,
  maxConcurrentWakes: 2,
};

const JobsFileSchema = z.object({ jobs: z.array(JobRecordSchema) });
type JobsFile = { jobs: JobRecord[] };

function jobsStore() {
  // Pinned filename + defaults shared by every reader/writer, including the
  // embedded MCP server's mirrored engine.
  return new PluginStorage<JobsFile>("paseo-remote-power", "jobs.json", { defaultData: { jobs: [] } });
}

export function isActiveJob(job: JobRecord): boolean {
  return (ACTIVE_JOB_STATUSES as readonly string[]).includes(job.status);
}

function wakeWindowSeconds(host: HostRecord, settings: EngineSettings): number {
  return host.wakeWindowSeconds ?? settings.defaultWakeWindowSeconds;
}

/** One wake transport executor. False (never a throw) means "this transport did not work". */
export type TransportRunner = (transport: WakeTransport, token: string | null) => Promise<boolean>;

export interface TransportRunners {
  http: TransportRunner;
  wol: TransportRunner;
  command: TransportRunner;
  microlink: TransportRunner;
}

const defaultRunners: TransportRunners = {
  async http(transport, token) {
    if (transport.type !== "http") return false;
    try {
      const response = await fetch(transport.url, {
        method: "POST",
        ...(token !== null ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        signal: AbortSignal.timeout(TRANSPORT_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  },
  async wol(transport) {
    if (transport.type !== "wol") return false;
    return sendMagicPacket(transport);
  },
  async command(transport) {
    if (transport.type !== "command") return false;
    const result = await realSpawn(transport.command, transport.args ?? [], TRANSPORT_TIMEOUT_MS);
    return result.code === 0;
  },
  async microlink(transport, secret) {
    if (transport.type !== "microlink" || secret === null) return false;
    const port = transport.port ?? MICROLINK_DEFAULT_PORT;
    const wire = { scheme: transport.scheme, headerPrefix: transport.headerPrefix };
    // sendWakeHttp/sendWakeUdp never throw; mode defaults to http.
    return transport.mode === "udp"
      ? sendWakeUdp(transport.host, port, secret, wire)
      : sendWakeHttp(transport.host, port, secret, wire);
  },
};

export interface WakeEngineDeps {
  settings?: () => EngineSettings;
  runners?: Partial<TransportRunners>;
  resolveTokenRef?: (ref: string) => string | null;
  probe?: (host: HostRecord) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  loadJobs?: () => JobRecord[];
  saveJobs?: (jobs: JobRecord[]) => void;
  log?: (line: string) => void;
}

export interface WakeOutcome {
  accepted: boolean;
  jobId: string | null;
  status: JobStatus;
  alreadyUp: boolean;
  error: { mode: "no-transport" | "never-reachable" | "saturated" | "unknown-host"; message: string } | null;
}

/** Real sleep for the verification loop, overridable in tests. */
export function defaultSleep(ms: number): Promise<void> {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  setTimeout(resolve, ms);
  return promise;
}

export function describeTransport(transport: WakeTransport): string {
  switch (transport.type) {
    case "http":
      return redactUrlForLog(transport.url);
    case "wol":
      return transport.host !== undefined ? `${transport.mac} via ${transport.host}` : transport.mac;
    case "command":
      return [transport.command, ...(transport.args ?? [])].join(" ");
    case "microlink":
      return `microlink(${transport.host}:${transport.port ?? MICROLINK_DEFAULT_PORT} ${transport.mode ?? "http"} ${transport.scheme ?? MICROLINK_DEFAULT_SCHEME})`;
  }
}

/** Log-safe URL: drop any userinfo credentials, keep scheme + host + path. */
export function redactUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.username === "" && parsed.password === ""
      ? parsed.toString()
      : `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url.replace(/\/\/[^@/]+@/, "//");
  }
}

function persistedJobs(): JobRecord[] {
  try {
    const parsed = JobsFileSchema.safeParse(jobsStore().read());
    return parsed.success ? parsed.data.jobs : [];
  } catch {
    return [];
  }
}

function persistJobs(jobs: JobRecord[]): void {
  try {
    jobsStore().write({ jobs });
  } catch {
    // Job persistence is best-effort; the outcome returned to the caller in
    // this process is authoritative either way.
  }
}

function pruneJobs(jobs: JobRecord[], nowMs: number): JobRecord[] {
  const fresh = jobs.filter((job) => {
    if (isActiveJob(job)) return true;
    const endedAt = job.endedAt ?? job.startedAt;
    return nowMs - endedAt <= JOBS_RETENTION_MS;
  });
  const finished = fresh.filter((job) => !isActiveJob(job));
  const overflow = finished.length - MAX_JOBS;
  if (overflow <= 0) return fresh;
  const dropped = new Set(finished.slice(0, overflow).map((job) => job.jobId));
  return fresh.filter((job) => !dropped.has(job.jobId));
}

export interface WakeEngine {
  startWake(host: HostRecord): Promise<WakeOutcome>;
  job(jobId: string): JobRecord | null;
  jobs(): JobRecord[];
}

export function createWakeEngine(deps: WakeEngineDeps = {}): WakeEngine {
  const settings = deps.settings ?? (() => DEFAULT_ENGINE_SETTINGS);
  const runners: TransportRunners = { ...defaultRunners, ...deps.runners };
  const resolveTokenRef = deps.resolveTokenRef ?? ((ref: string) => resolveToken(ref));
  const probe =
    deps.probe ??
    (async (host: HostRecord) => probeReachable(host, { timeoutSeconds: settings().probeTimeoutSeconds }));
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? (() => Date.now());
  const loadJobs = deps.loadJobs ?? persistedJobs;
  const saveJobs = deps.saveJobs ?? persistJobs;
  const log = deps.log ?? ((line: string) => engineLog.info(line));

  function withTransition(jobId: string, mutate: (job: JobRecord) => JobRecord): void {
    const jobs = loadJobs();
    const index = jobs.findIndex((entry) => entry.jobId === jobId);
    if (index === -1) return;
    const next = [...jobs];
    next[index] = mutate(jobs[index]);
    saveJobs(pruneJobs(next, now()));
  }

  function appendJob(job: JobRecord): void {
    saveJobs(pruneJobs([...loadJobs(), job], now()));
  }

  /** The transport ladder, then the bounded verification window. */
  async function runJob(host: HostRecord, jobId: string): Promise<void> {
    const job = loadJobs().find((entry) => entry.jobId === jobId);
    if (!job) return;
    const startedAt = job.startedAt;
    const windowSeconds = wakeWindowSeconds(host, settings());
    withTransition(jobId, (entry) => ({
      ...entry,
      status: "waking",
      log: [...entry.log, `waking '${host.name}' via ${host.wakeTransports.length} transport(s)`],
    }));

    let acceptedBy: string | null = null;
    for (const transport of host.wakeTransports) {
      const label = describeTransport(transport);
      log(`host '${host.id}': trying ${transport.type} wake (${label})`);
      withTransition(jobId, (entry) => ({ ...entry, log: [...entry.log, `trying ${transport.type} (${label})`] }));
      let ok = false;
      try {
        const token =
          transport.type === "http"
            ? resolveTokenRef(transport.tokenRef ?? "")
            : transport.type === "microlink"
              ? resolveTokenRef(transport.secretRef ?? "")
              : null;
        ok = await runners[transport.type](transport, token);
      } catch (cause) {
        log(`host '${host.id}': ${transport.type} wake threw: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      if (ok) {
        acceptedBy = transport.type;
        log(`host '${host.id}': ${transport.type} wake accepted`);
        withTransition(jobId, (entry) => ({ ...entry, status: "verifying", log: [...entry.log, `${transport.type} accepted`] }));
        break;
      }
      withTransition(jobId, (entry) => ({ ...entry, log: [...entry.log, `${transport.type} failed`] }));
    }

    if (acceptedBy === null) {
      log(`host '${host.id}': wake failed — no usable wake transport`);
      withTransition(jobId, (entry) => ({
        ...entry,
        status: "failed",
        endedAt: now(),
        error: { mode: "no-transport", message: "no usable wake transport" },
        log: [...entry.log, "wake failed — no usable wake transport"],
      }));
      return;
    }

    const deadline = startedAt + windowSeconds * 1000;
    withTransition(jobId, (entry) => ({ ...entry, log: [...entry.log, `verifying reachability (window ${windowSeconds}s)`] }));
    for (;;) {
      const remaining = deadline - now();
      if (remaining <= 0) break;
      await sleep(Math.min(WAKE_POLL_INTERVAL_MS, remaining));
      if (await probe(host)) {
        const elapsed = Math.round((now() - startedAt) / 1000);
        log(`host '${host.id}': reachable after ${elapsed}s`);
        withTransition(jobId, (entry) => ({
          ...entry,
          status: "up",
          endedAt: now(),
          log: [...entry.log, `host reachable after ${elapsed}s`],
        }));
        return;
      }
    }
    // One final probe past the deadline, mirroring the source script's last check.
    if (await probe(host)) {
      withTransition(jobId, (entry) => ({ ...entry, status: "up", endedAt: now(), log: [...entry.log, "host reachable"] }));
      return;
    }
    log(`host '${host.id}': wake failed — accepted via ${acceptedBy} but the host never became reachable`);
    withTransition(jobId, (entry) => ({
      ...entry,
      status: "failed",
      endedAt: now(),
      error: {
        mode: "never-reachable",
        message: `wake accepted via ${acceptedBy} but the host never became reachable within ${windowSeconds}s`,
      },
      log: [...entry.log, `wake failed — burst accepted, host never came up within ${windowSeconds}s`],
    }));
  }

  return {
    /** Start an async wake for a host (idempotent, bounded concurrency). */
    async startWake(host: HostRecord): Promise<WakeOutcome> {
      const jobs = loadJobs();
      const existing = jobs.find((job) => job.hostId === host.id && isActiveJob(job));
      if (existing) {
        return { accepted: false, jobId: existing.jobId, status: existing.status, alreadyUp: false, error: null };
      }
      // Idempotence outranks the concurrency cap: an up host needs no wake, so
      // answer that before rejecting on load.
      if (await probe(host)) {
        log(`host '${host.id}': already up — no wake needed`);
        return { accepted: false, jobId: null, status: "up", alreadyUp: true, error: null };
      }
      const limits = settings();
      const active = jobs.filter(isActiveJob).length;
      if (active >= limits.maxConcurrentWakes) {
        return {
          accepted: false,
          jobId: null,
          status: "failed",
          alreadyUp: false,
          error: {
            mode: "saturated",
            message: `${active} wake job(s) already running (max ${limits.maxConcurrentWakes}) — try again when one finishes`,
          },
        };
      }
      const job: JobRecord = {
        jobId: `job-${randomUUID().slice(0, 8)}`,
        hostId: host.id,
        status: "starting",
        startedAt: now(),
        endedAt: null,
        error: null,
        log: [`wake requested for '${host.name}'`],
      };
      appendJob(job);
      log(`host '${host.id}': wake job ${job.jobId} started`);
      void runJob(host, job.jobId).catch((cause) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        log(`host '${host.id}': wake job crashed: ${message}`);
        withTransition(job.jobId, (entry) => ({
          ...entry,
          status: "failed",
          endedAt: now(),
          error: { mode: "no-transport", message },
        }));
      });
      return { accepted: true, jobId: job.jobId, status: job.status, alreadyUp: false, error: null };
    },
    job(jobId: string): JobRecord | null {
      return loadJobs().find((entry) => entry.jobId === jobId) ?? null;
    },
    jobs(): JobRecord[] {
      return loadJobs();
    },
  };
}
