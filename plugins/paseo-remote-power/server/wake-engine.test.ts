import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWakeEngine,
  describeTransport,
  redactUrlForLog,
  DEFAULT_WAKE_WINDOW_SECONDS,
  WAKE_POLL_INTERVAL_MS,
  type EngineSettings,
  type WakeEngine,
  type WakeEngineDeps,
} from "./wake-engine.ts";
import type { HostRecord, JobRecord, WakeTransport } from "../shared/registry.ts";

/**
 * The engine is the ported wake script: ordered transports with fallback, a
 * bounded verification window, idempotence, and two distinct failure modes.
 * Every primitive (transports, probe, sleep, clock, job store) is faked here,
 * so the state machine runs instantly and deterministically — no real
 * network, no real timers, no real state dir.
 */

const SETTINGS: EngineSettings = {
  defaultWakeWindowSeconds: DEFAULT_WAKE_WINDOW_SECONDS,
  probeTimeoutSeconds: 8,
  maxConcurrentWakes: 2,
};

function host(overrides: Partial<HostRecord> = {}, transports: WakeTransport[] = []): HostRecord {
  return {
    id: "host-1",
    name: "build-box",
    wakeTransports: transports,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

interface Harness {
  jobs: JobRecord[];
  calls: string[];
  engine: WakeEngine;
}

function makeEngine(options: { probeAnswers?: boolean[]; maxConcurrentWakes?: number } = {}): Harness {
  const jobs: JobRecord[] = [];
  const calls: string[] = [];
  const probeAnswers = options.probeAnswers ?? [];
  let clock = 1_000_000;
  const deps: WakeEngineDeps = {
    settings: () => ({
      ...SETTINGS,
      ...(options.maxConcurrentWakes !== undefined ? { maxConcurrentWakes: options.maxConcurrentWakes } : {}),
    }),
    runners: {
      http: async () => {
        calls.push("http:run");
        return true;
      },
      wol: async () => {
        calls.push("wol:run");
        return true;
      },
      command: async () => {
        calls.push("command:run");
        return true;
      },
    },
    resolveTokenRef: (ref) => (ref === "ref-a" ? "secret-a" : null),
    probe: async () => {
      const answer = probeAnswers.shift() ?? false;
      calls.push(`probe:${answer ? "up" : "down"}`);
      clock += 4_000;
      return answer;
    },
    sleep: async () => {
      clock += WAKE_POLL_INTERVAL_MS;
    },
    now: () => clock,
    loadJobs: () => jobs.map((job) => structuredClone(job)),
    saveJobs: (next) => {
      jobs.splice(0, jobs.length, ...next);
    },
    log: () => {},
  };
  return { jobs, calls, engine: createWakeEngine(deps) };
}

/** Drive the async job to a terminal status using the fake clock, instantly. */
async function settle(jobs: JobRecord[], status: "up" | "failed" = "up"): Promise<void> {
  for (let spin = 0; spin < 200 && jobs.at(-1)?.status !== status; spin++) {
    await new Promise<void>((resolveTick) => setImmediate(resolveTick));
  }
}

test("ordered transports run in list order and stop at the first success", async () => {
  const harness = makeEngine({ probeAnswers: [false, true] });
  const transports: WakeTransport[] = [
    { type: "wol", mac: "00:11:22:33:44:55" },
    { type: "http", url: "http://192.0.2.10/wake", tokenRef: "ref-a" },
  ];
  const started = await harness.engine.startWake(host({}, transports));
  assert.equal(started.accepted, true);
  const jobId = started.jobId as string;

  await settle(harness.jobs);
  const job = harness.jobs.find((entry) => entry.jobId === jobId);
  assert.ok(job);
  assert.equal(job.status, "up");
  assert.deepEqual(harness.calls, ["probe:down", "wol:run", "probe:up"]);
  assert.equal(harness.calls.includes("http:run"), false, "fallback must not run after a success");
  assert.ok(job.log.some((line) => line.includes("verifying reachability")));
  assert.ok(job.log.some((line) => line.includes("host reachable after")));
});

test("fallback continues down the ladder when a transport fails", async () => {
  const jobs: JobRecord[] = [];
  let clock = 1_000_000;
  const calls: string[] = [];
  const engine = createWakeEngine({
    settings: () => SETTINGS,
    runners: {
      http: async () => {
        calls.push("http:run");
        return false;
      },
      wol: async () => {
        calls.push("wol:run");
        return false;
      },
      command: async () => {
        calls.push("command:run");
        return true;
      },
    },
    // The gate probe says down; the verification probe says up, but only once
    // the last transport has run — a first-transport success must not mask
    // the fallback walk.
    probe: async () => {
      calls.push("probe:up");
      clock += 4_000;
      return calls.includes("command:run");
    },
    sleep: async () => {
      clock += WAKE_POLL_INTERVAL_MS;
    },
    now: () => clock,
    loadJobs: () => jobs.map((job) => structuredClone(job)),
    saveJobs: (next) => jobs.splice(0, jobs.length, ...next),
    log: () => {},
  });
  const started = await engine.startWake(
    host({}, [
      { type: "http", url: "http://192.0.2.10/wake" },
      { type: "wol", mac: "00:11:22:33:44:55" },
      { type: "command", command: "/usr/local/bin/wake" },
    ]),
  );
  assert.equal(started.accepted, true);
  await settle(jobs);
  assert.deepEqual(calls.filter((entry) => entry.endsWith(":run")), ["http:run", "wol:run", "command:run"]);
  const job = jobs[0];
  assert.equal(job.status, "up");
  assert.ok(job.log.some((line) => line.includes("trying http")));
  assert.ok(job.log.some((line) => line.includes("http failed")));
});

test("every transport failing reports the no-usable-transport failure mode", async () => {
  const jobs: JobRecord[] = [];
  const engine = createWakeEngine({
    settings: () => SETTINGS,
    runners: {
      http: async () => false,
      wol: async () => false,
      command: async () => false,
    },
    probe: async () => false,
    sleep: async () => {},
    now: () => 1_000_000,
    loadJobs: () => jobs.map((job) => structuredClone(job)),
    saveJobs: (next) => jobs.splice(0, jobs.length, ...next),
    log: () => {},
  });
  const started = await engine.startWake(host({}, [{ type: "wol", mac: "00:11:22:33:44:55" }]));
  await settle(jobs, "failed");
  const job = jobs[0];
  assert.equal(job.status, "failed");
  assert.equal(job.error?.mode, "no-transport");
  assert.equal(job.error?.message, "no usable wake transport");
  assert.equal(started.accepted, true);
});

test("an already-up host is never woken — idempotence", async () => {
  const harness = makeEngine({ probeAnswers: [true] });
  const outcome = await harness.engine.startWake(host({}, [{ type: "wol", mac: "00:11:22:33:44:55" }]));
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.jobId, null);
  assert.equal(outcome.alreadyUp, true);
  assert.equal(outcome.status, "up");
  assert.equal(harness.jobs.length, 0, "no job is created for an up host");
});

test("a burst that is accepted but never becomes reachable reports verified-timeout", async () => {
  const jobs: JobRecord[] = [];
  let clock = 1_000_000;
  let probes = 0;
  const engine = createWakeEngine({
    settings: () => SETTINGS,
    runners: { http: async () => true, wol: async () => false, command: async () => false },
    probe: async () => {
      probes += 1;
      clock += 4_000;
      return false;
    },
    sleep: async () => {
      clock += WAKE_POLL_INTERVAL_MS;
    },
    now: () => clock,
    loadJobs: () => jobs.map((job) => structuredClone(job)),
    saveJobs: (next) => jobs.splice(0, jobs.length, ...next),
    log: () => {},
  });
  const started = await engine.startWake(host({}, [{ type: "http", url: "http://192.0.2.10/wake" }]));
  assert.equal(started.accepted, true);
  await settle(jobs, "failed");
  const job = jobs[0];
  assert.equal(job.status, "failed");
  assert.equal(job.error?.mode, "never-reachable");
  assert.match(job.error?.message ?? "", /never became reachable within 110s/);
  assert.ok(job.log.some((line) => line.includes("burst accepted, host never came up")));
  // The verification window is bounded: probes stop after ~110s of fake time.
  assert.ok(probes <= 32, `verification polled ${probes} times, window is unbounded`);
  assert.ok(job.endedAt !== null);
});

test("a per-host wake window overrides the settings default", async () => {
  const jobs: JobRecord[] = [];
  let clock = 1_000_000;
  let probes = 0;
  const engine = createWakeEngine({
    settings: () => SETTINGS,
    runners: { http: async () => true, wol: async () => false, command: async () => false },
    probe: async () => {
      probes += 1;
      clock += 4_000;
      return false;
    },
    sleep: async () => {
      clock += 1_000;
    },
    now: () => clock,
    loadJobs: () => jobs.map((job) => structuredClone(job)),
    saveJobs: (next) => jobs.splice(0, jobs.length, ...next),
    log: () => {},
  });
  await engine.startWake(host({ wakeWindowSeconds: 12 }, [{ type: "http", url: "http://192.0.2.10/wake" }]));
  await settle(jobs, "failed");
  assert.equal(jobs[0].status, "failed");
  assert.match(jobs[0].error?.message ?? "", /within 12s/);
  assert.ok(probes <= 14, "a short window must bound the poll loop tightly");
});

test("a host with a wake in flight returns the existing job instead of stacking one", async () => {
  const harness = makeEngine();
  const first = await harness.engine.startWake(host({}, [{ type: "http", url: "http://192.0.2.10/wake" }]));
  const second = await harness.engine.startWake(host({}, [{ type: "http", url: "http://192.0.2.10/wake" }]));
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(second.jobId, first.jobId);
  assert.equal(harness.jobs.length, 1);
});

test("the concurrency cap rejects a third simultaneous wake", async () => {
  const harness = makeEngine({ maxConcurrentWakes: 2 });
  const blocked = host({ id: "host-blocked", name: "blocked" });
  // Two jobs already active (created directly, statuses starting), so the next wake is over the cap.
  harness.jobs.push(
    {
      jobId: "job-a",
      hostId: "host-a",
      status: "starting",
      startedAt: 1,
      endedAt: null,
      error: null,
      log: [],
    },
    {
      jobId: "job-b",
      hostId: "host-b",
      status: "verifying",
      startedAt: 1,
      endedAt: null,
      error: null,
      log: [],
    },
  );
  const outcome = await harness.engine.startWake(blocked);
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.jobId, null);
  assert.equal(outcome.error?.mode, "saturated");
  assert.match(outcome.error?.message ?? "", /max 2/);
});

test("http transports receive the resolved bearer token; missing refs resolve to none", async () => {
  const jobs: JobRecord[] = [];
  const seenTokens: (string | null)[] = [];
  const probeAnswers = [false, true, false, true];
  let clock = 1_000_000;
  const engine = createWakeEngine({
    settings: () => SETTINGS,
    runners: {
      http: async (_transport, token) => {
        seenTokens.push(token);
        return true;
      },
      wol: async () => false,
      command: async () => false,
    },
    probe: async () => {
      clock += 4_000;
      return probeAnswers.shift() ?? false;
    },
    sleep: async () => {
      clock += WAKE_POLL_INTERVAL_MS;
    },
    now: () => clock,
    resolveTokenRef: (ref) => (ref === "ref-a" ? "secret-a" : null),
    loadJobs: () => jobs.map((job) => structuredClone(job)),
    saveJobs: (next) => jobs.splice(0, jobs.length, ...next),
    log: () => {},
  });

  await engine.startWake(host({}, [{ type: "http", url: "http://192.0.2.10/wake", tokenRef: "ref-a" }]));
  await settle(jobs);
  await engine.startWake(host({}, [{ type: "http", url: "http://192.0.2.20/wake" }]));
  await settle(jobs);
  assert.deepEqual(seenTokens, ["secret-a", null]);
});

test("transport descriptions are log-safe: no userinfo survives redaction", () => {
  assert.equal(redactUrlForLog("http://192.0.2.10/wake"), "http://192.0.2.10/wake");
  assert.equal(redactUrlForLog("http://user:secret@192.0.2.10:8080/wake?x=1"), "http://192.0.2.10:8080/wake?x=1");
  assert.equal(redactUrlForLog("not a url at all"), "not a url at all");
  assert.equal(describeTransport({ type: "wol", mac: "00:11:22:33:44:55" }), "00:11:22:33:44:55");
  assert.equal(describeTransport({ type: "wol", mac: "00:11:22:33:44:55", host: "192.0.2.255" }), "00:11:22:33:44:55 via 192.0.2.255");
  assert.equal(describeTransport({ type: "command", command: "wake", args: ["--port", "9"] }), "wake --port 9");
});
