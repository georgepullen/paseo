import { test } from "node:test";
import assert from "node:assert/strict";
import type { HostRecord } from "../shared/registry.ts";
import { createAgentHoldTracker, HOLD_REFRESH_MS, RECONCILE_MS } from "./agent-hold.ts";

const silentLogger = { info: () => {}, warn: () => {} };
const paseo = { agents: {} };

function host(overrides: Partial<HostRecord> = {}): HostRecord {
  return {
    id: "host-gpu",
    name: "gpu-box",
    wakeTransports: [],
    holdCommand: { command: "ssh", args: ["gpu-box", "touch", "/tmp/wake-hold"] },
    agentModels: ["qwen3090champ/"],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

interface FakeInterval {
  callback: () => void;
  ms: number;
  cleared: boolean;
}

function makeFakeTimers() {
  const intervals: FakeInterval[] = [];
  return {
    intervals,
    timers: {
      setInterval: (callback: () => void, ms: number) => {
        const handle: FakeInterval = { callback, ms, cleared: false };
        intervals.push(handle);
        return handle;
      },
      clearInterval: (handle: unknown) => {
        (handle as FakeInterval).cleared = true;
      },
    },
    fire(ms: number): boolean {
      const handle = intervals.find((entry) => entry.ms === ms && !entry.cleared);
      if (!handle) return false;
      handle.callback();
      return true;
    },
    activeCount(ms: number): number {
      return intervals.filter((entry) => entry.ms === ms && !entry.cleared).length;
    },
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("hold cadence constants sit well inside the registrar wake-hold TTL", () => {
  assert.equal(HOLD_REFRESH_MS, 600_000);
  assert.equal(RECONCILE_MS, 60_000);
});

test("a matching-model turn wakes and holds once, refreshes on the cadence, and stops at turn end", async () => {
  const fake = makeFakeTimers();
  let wakeCalls = 0;
  let holdCalls = 0;
  const tracker = createAgentHoldTracker({
    loadHostsFn: () => [host()],
    fetchAgent: async (agentId) =>
      agentId === "agent-1"
        ? { model: "qwen3090champ/qwen3.8-27b:high", status: "running", activeTurn: { id: "turn-1" } }
        : null,
    listAgents: async () => [],
    startWake: async () => {
      wakeCalls += 1;
    },
    runCommand: async () => {
      holdCalls += 1;
    },
    logger: silentLogger,
    timers: fake.timers,
  });
  try {
    await tracker.turnStarted("agent-1", paseo);
    assert.equal(wakeCalls, 1);
    assert.equal(holdCalls, 1);
    assert.equal(fake.activeCount(HOLD_REFRESH_MS), 1);
    assert.equal(fake.activeCount(RECONCILE_MS), 1, "the first event captures paseo and starts reconcile");

    await tracker.turnStarted("agent-1", paseo);
    assert.equal(wakeCalls, 1, "a duplicate turn event does not re-wake");
    assert.equal(holdCalls, 1);

    assert.equal(fake.fire(HOLD_REFRESH_MS), true);
    await flush();
    assert.equal(holdCalls, 2, "the refresh cadence re-runs the hold");
    assert.equal(wakeCalls, 1, "refresh holds without re-waking");

    tracker.turnEnded("agent-1");
    assert.equal(fake.activeCount(HOLD_REFRESH_MS), 0, "turn end stops the refresh timer");
    assert.equal(fake.fire(HOLD_REFRESH_MS), false);
    await flush();
    assert.equal(holdCalls, 2);
  } finally {
    tracker.stop();
  }
});

test("a non-matching model does nothing, while activeTurn alone still matches an idle snapshot", async () => {
  const fake = makeFakeTimers();
  let wakeCalls = 0;
  let holdCalls = 0;
  const snapshots: Record<string, { model: string; status: string; activeTurn: unknown }> = {
    "agent-other": { model: "anthropic/claude-sonnet", status: "running", activeTurn: { id: "t" } },
    "agent-idle-turn": { model: "qwen3090champ/qwen3.8-27b", status: "idle", activeTurn: { id: "t2" } },
    "agent-idle-done": { model: "qwen3090champ/qwen3.8-27b", status: "idle", activeTurn: null },
  };
  const tracker = createAgentHoldTracker({
    loadHostsFn: () => [host()],
    fetchAgent: async (agentId) => snapshots[agentId] ?? null,
    listAgents: async () => [],
    startWake: async () => {
      wakeCalls += 1;
    },
    runCommand: async () => {
      holdCalls += 1;
    },
    logger: silentLogger,
    timers: fake.timers,
  });
  try {
    await tracker.turnStarted("agent-other", paseo);
    await tracker.turnStarted("agent-idle-done", paseo);
    assert.equal(wakeCalls, 0);
    assert.equal(holdCalls, 0);
    assert.equal(fake.activeCount(HOLD_REFRESH_MS), 0);

    await tracker.turnStarted("agent-idle-turn", paseo);
    assert.equal(wakeCalls, 1, "a non-null activeTurn counts as active even when status reads idle");
    assert.equal(holdCalls, 1);
  } finally {
    tracker.stop();
  }
});

test("reconcile adds a missed agent and drops one whose turn ended without an event", async () => {
  const fake = makeFakeTimers();
  let wakeCalls = 0;
  let holdCalls = 0;
  let listed: { id: string; model: string; status: string; activeTurn: unknown }[] = [];
  const tracker = createAgentHoldTracker({
    loadHostsFn: () => [host()],
    fetchAgent: async () => null,
    listAgents: async () => listed,
    startWake: async () => {
      wakeCalls += 1;
    },
    runCommand: async () => {
      holdCalls += 1;
    },
    logger: silentLogger,
    timers: fake.timers,
  });
  try {
    // A turn that started before the plugin loaded: no event, found by reconcile.
    listed = [{ id: "agent-missed", model: "qwen3090champ/qwen3.8-27b:high", status: "running", activeTurn: { id: "t" } }];
    await tracker.reconcile(paseo);
    assert.equal(wakeCalls, 1);
    assert.equal(holdCalls, 1);
    assert.equal(fake.activeCount(HOLD_REFRESH_MS), 1);

    // Reconciling the same live set is a no-op (no second wake).
    await tracker.reconcile(paseo);
    assert.equal(wakeCalls, 1);
    assert.equal(holdCalls, 1);

    // The turn ended but agent.turn_ended was missed: reconcile drops it.
    listed = [{ id: "agent-missed", model: "qwen3090champ/qwen3.8-27b:high", status: "idle", activeTurn: null }];
    await tracker.reconcile(paseo);
    assert.equal(fake.activeCount(HOLD_REFRESH_MS), 0, "the stale agent's refresh timer is stopped");
    assert.equal(fake.fire(HOLD_REFRESH_MS), false);
    await flush();
    assert.equal(holdCalls, 1, "no further holds after the stale agent is dropped");
  } finally {
    tracker.stop();
  }
});

test("tracker errors are logged, never thrown", async () => {
  const fake = makeFakeTimers();
  const warnings: string[] = [];
  const tracker = createAgentHoldTracker({
    loadHostsFn: () => [host()],
    fetchAgent: async () => {
      throw new Error("paseo unreachable");
    },
    listAgents: async () => {
      throw new Error("list failed");
    },
    startWake: async () => {},
    runCommand: async () => {},
    logger: { info: () => {}, warn: (message) => warnings.push(message) },
    timers: fake.timers,
  });
  try {
    await tracker.turnStarted("agent-1", paseo);
    await tracker.reconcile(paseo);
    tracker.turnEnded("agent-1");
    assert.ok(warnings.length >= 1);
  } finally {
    tracker.stop();
  }
});
