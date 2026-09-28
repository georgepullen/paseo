import { describe, expect, it } from "vitest";
import {
  flattenAgents,
  normalizeAgentCategory,
  summarizeFleetHealth,
  type FleetAgent,
  type FleetAgentsSnapshot,
} from "../types.js";

function agent(overrides: Partial<FleetAgent> & { id: string }): FleetAgent {
  return {
    name: overrides.id,
    category: "worker",
    deterministicState: "working",
    ...overrides,
  };
}

describe("summarizeFleetHealth", () => {
  it("counts running, errored, attention, and per-category totals", () => {
    const agents = [
      agent({ id: "a", category: "frontdesk", deterministicState: "running" }),
      agent({ id: "b", category: "orchestrator", deterministicState: "working", requiresAttention: true }),
      agent({ id: "c", category: "worker", deterministicState: "failed:error" }),
      agent({ id: "d", category: "worker", deterministicState: "idle:waiting" }),
    ];
    expect(summarizeFleetHealth(agents)).toEqual({
      total: 4,
      running: 2,
      idle: 1,
      errored: 1,
      attention: 1,
      byCategory: { frontdesk: 1, orchestrator: 1, worker: 2 },
    });
  });

  it("handles an empty fleet", () => {
    expect(summarizeFleetHealth([])).toEqual({
      total: 0,
      running: 0,
      idle: 0,
      errored: 0,
      attention: 0,
      byCategory: { frontdesk: 0, orchestrator: 0, worker: 0 },
    });
  });
});

describe("normalizeAgentCategory", () => {
  it("passes known categories through and falls back to worker", () => {
    expect(normalizeAgentCategory("orchestrator")).toBe("orchestrator");
    expect(normalizeAgentCategory("frontdesk")).toBe("frontdesk");
    expect(normalizeAgentCategory("sidecar")).toBe("worker");
    expect(normalizeAgentCategory(undefined)).toBe("worker");
  });
});

describe("flattenAgents", () => {
  it("returns [] for a null snapshot", () => {
    expect(flattenAgents(null)).toEqual([]);
  });

  it("concatenates frontdesk, orchestrators, and workers in order", () => {
    const snapshot: FleetAgentsSnapshot = {
      frontdesk: [agent({ id: "f", category: "frontdesk", deterministicState: "running" })],
      orchestrators: [agent({ id: "o", category: "orchestrator", deterministicState: "sleeping" })],
      workers: [agent({ id: "w", category: "worker", deterministicState: "working" })],
      totalCount: 3,
      runningCount: 2,
      idleCount: 1,
      errorCount: 0,
    };
    expect(flattenAgents(snapshot).map((entry) => entry.id)).toEqual(["f", "o", "w"]);
  });
});
