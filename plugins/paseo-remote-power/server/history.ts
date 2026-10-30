import { PluginStorage } from "paseo-plugin-helper/server";
import { z } from "zod";
import { STATUS_SEGMENTS, type HostRecord, type MicrolinkTransport } from "../shared/registry.ts";
import { MICROLINK_DEFAULT_PORT, observeHttp, type ObserverReport } from "./microlink.ts";
import { probeHost, type ObserveFn, type ProbeOptions } from "./probe.ts";
import { loadHosts } from "./registry.ts";
import { readSettings } from "./settings.ts";

/**
 * Probe history behind the dashboard strips. While the daemon runs, every host
 * is sampled on a fixed cadence with the same probes `host.status` uses, so
 * sampling never wakes anything. Each sample records whether the host was up
 * and, for hosts with a microlink transport, whether the wake authority
 * answered and its signal strength. Samples older than 24h are dropped; time
 * the daemon was not running stays a gap rather than a guess.
 */

export const SAMPLE_INTERVAL_MS = 5 * 60_000;
const WINDOW_MS = 24 * 60 * 60_000;
const SEGMENT_MS = WINDOW_MS / STATUS_SEGMENTS;

const SampleSchema = z.object({
  /** epoch ms */
  t: z.number(),
  /** 1 up, 0 down; absent when the probe had no opinion. */
  up: z.union([z.literal(0), z.literal(1)]).optional(),
  /** Wake authority answered (1) or not (0); absent for hosts without one. */
  board: z.union([z.literal(0), z.literal(1)]).optional(),
  rssi: z.number().optional(),
});
export type Sample = z.infer<typeof SampleSchema>;

const HistoryFileSchema = z.object({ hosts: z.record(z.string(), z.array(SampleSchema)) });
type HistoryFile = z.infer<typeof HistoryFileSchema>;

export function historyStore(baseDir?: string) {
  return new PluginStorage<HistoryFile>("paseo-remote-power", "history.json", {
    defaultData: { hosts: {} },
    ...(baseDir !== undefined ? { baseDir } : {}),
  });
}

export function loadHistory(hostId: string, baseDir?: string): Sample[] {
  try {
    const parsed = HistoryFileSchema.safeParse(historyStore(baseDir).read());
    return parsed.success ? (parsed.data.hosts[hostId] ?? []) : [];
  } catch {
    return [];
  }
}

/** Append one sample per host and prune to the window; hosts no longer configured are dropped. */
export function appendSamples(samples: Record<string, Sample>, now: number, baseDir?: string): void {
  const store = historyStore(baseDir);
  let current: HistoryFile = { hosts: {} };
  try {
    const parsed = HistoryFileSchema.safeParse(store.read());
    if (parsed.success) current = parsed.data;
  } catch {
    // A corrupt history file restarts the strips; it never blocks sampling.
  }
  const next: HistoryFile = { hosts: {} };
  for (const [hostId, sample] of Object.entries(samples)) {
    next.hosts[hostId] = [...(current.hosts[hostId] ?? []), sample].filter((entry) => entry.t > now - WINDOW_MS);
  }
  store.write(next);
}

/** Fold samples into STATUS_SEGMENTS segments (oldest first) of one field's mean. */
export function toStrip(samples: Sample[], field: "up" | "board", now: number): Array<number | null> {
  const sums = new Array<number>(STATUS_SEGMENTS).fill(0);
  const counts = new Array<number>(STATUS_SEGMENTS).fill(0);
  const start = now - WINDOW_MS;
  for (const sample of samples) {
    const value = sample[field];
    if (value === undefined || sample.t <= start || sample.t > now) continue;
    const index = Math.min(STATUS_SEGMENTS - 1, Math.floor((sample.t - start) / SEGMENT_MS));
    sums[index] += value;
    counts[index]++;
  }
  return sums.map((sum, index) => (counts[index] > 0 ? sum / counts[index] : null));
}

function microlinkOf(host: HostRecord): MicrolinkTransport | undefined {
  return host.wakeTransports.find((transport): transport is MicrolinkTransport => transport.type === "microlink");
}

/** Probe one host and report what the dashboard records. */
export async function sampleHost(
  host: HostRecord,
  now: number,
  options: ProbeOptions & { observeImpl?: ObserveFn } = {},
): Promise<Sample> {
  const observe: ObserveFn = options.observeImpl ?? ((obsHost, obsPort) => observeHttp(obsHost, obsPort));
  // The probe consults the observer for microlink hosts; reuse its answer for
  // the board strip instead of asking the device twice.
  let observed: { report: ObserverReport | null } | null = null;
  const probe = await probeHost(host, {
    ...options,
    observeImpl: async (obsHost, obsPort) => {
      const report = await observe(obsHost, obsPort).catch(() => null);
      observed = { report };
      return report;
    },
  });
  const sample: Sample = { t: now };
  if (probe.state !== "unknown") sample.up = probe.state === "up" ? 1 : 0;
  const microlink = microlinkOf(host);
  if (microlink) {
    const answer: { report: ObserverReport | null } =
      observed ?? { report: await observe(microlink.host, microlink.port ?? MICROLINK_DEFAULT_PORT).catch(() => null) };
    sample.board = answer.report !== null ? 1 : 0;
    if (answer.report?.rssi != null) sample.rssi = answer.report.rssi;
  }
  return sample;
}

/** Start the sampler: one pass now, then every SAMPLE_INTERVAL_MS. Returns a stop function. */
export function startHistorySampler(): () => void {
  let stopped = false;
  let running = false;
  const pass = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const now = Date.now();
      const hosts = loadHosts();
      const timeoutSeconds = readSettings().probeTimeoutSeconds;
      const samples = await Promise.all(hosts.map((host) => sampleHost(host, now, { timeoutSeconds })));
      if (!stopped) appendSamples(Object.fromEntries(hosts.map((host, index) => [host.id, samples[index]])), now);
    } catch {
      // Sampling is best effort; the next pass tries again.
    } finally {
      running = false;
    }
  };
  void pass();
  const timer = setInterval(() => void pass(), SAMPLE_INTERVAL_MS);
  // Never the reason a process stays alive; the plugin's IPC channel owns that.
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
