import { describe, expect, it } from "vitest";
import { filterAuditEntries, formatAuditTime, summarizeAuditInput } from "./filter.js";
import type { PermissionAuditEntry } from "./shared.js";

function entry(overrides: Partial<PermissionAuditEntry> = {}): PermissionAuditEntry {
  return {
    id: "r1",
    timestamp: "2026-09-28T10:00:00.000Z",
    agentId: "agent-1",
    kind: "tool",
    name: "bash",
    input: { command: "ls" },
    decision: "allow",
    ...overrides,
  };
}

describe("filterAuditEntries", () => {
  const entries = [
    entry({ id: "a", name: "bash", agentId: "agent-1", decision: "allow" }),
    entry({ id: "b", name: "read", agentId: "agent-2", agentModel: "m2", decision: "deny" }),
    entry({ id: "c", name: "write", agentId: "agent-1", decision: "pending" }),
  ];

  it("passes everything through on the all filter without search", () => {
    expect(filterAuditEntries(entries, "all", "")).toHaveLength(3);
  });

  it("filters by decision", () => {
    expect(filterAuditEntries(entries, "deny", "").map((e) => e.id)).toEqual(["b"]);
    expect(filterAuditEntries(entries, "pending", "").map((e) => e.id)).toEqual(["c"]);
  });

  it("searches tool, agent, model, and serialized input", () => {
    expect(filterAuditEntries(entries, "all", "read").map((e) => e.id)).toEqual(["b"]);
    expect(filterAuditEntries(entries, "all", "agent-2").map((e) => e.id)).toEqual(["b"]);
    expect(filterAuditEntries(entries, "all", "m2").map((e) => e.id)).toEqual(["b"]);
    expect(filterAuditEntries(entries, "all", "AGENT-1").map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("combines decision and search filters", () => {
    expect(filterAuditEntries(entries, "allow", "agent-1").map((e) => e.id)).toEqual(["a"]);
    expect(filterAuditEntries(entries, "deny", "agent-1")).toHaveLength(0);
  });
});

describe("summarizeAuditInput", () => {
  it("renders placeholders and truncates long payloads", () => {
    expect(summarizeAuditInput(null)).toBe("—");
    expect(summarizeAuditInput(undefined)).toBe("—");
    expect(summarizeAuditInput("short")).toBe("short");
    expect(summarizeAuditInput("x".repeat(200))).toHaveLength(121);
    expect(summarizeAuditInput({ command: "ls" })).toContain("ls");
  });
});

describe("formatAuditTime", () => {
  it("passes through unparseable timestamps", () => {
    expect(formatAuditTime("not-a-date")).toBe("not-a-date");
    expect(formatAuditTime("2026-09-28T10:00:00.000Z")).not.toBe("2026-09-28T10:00:00.000Z");
  });
});
