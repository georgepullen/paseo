import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PermissionLogStore } from "./storage";
import type { PermissionAuditEntry } from "../shared/contracts";

function entry(overrides: Partial<PermissionAuditEntry> = {}): PermissionAuditEntry {
  return {
    id: `req-${Math.random().toString(36).slice(2)}`,
    timestamp: "2026-09-28T10:00:00.000Z",
    agentId: "agent-1",
    kind: "tool",
    name: "bash",
    input: { command: "ls" },
    decision: "allow",
    ...overrides,
  };
}

describe("PermissionLogStore", () => {
  let dir: string;
  let store: PermissionLogStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "perm-log-"));
    store = new PermissionLogStore({ filePath: path.join(dir, "permissions.jsonl") });
  });

  it("reads empty when no log file exists", () => {
    expect(store.readAll()).toEqual([]);
  });

  it("appends entries as JSONL lines and reads them back", () => {
    store.append(entry({ id: "a" }));
    store.append(entry({ id: "b", decision: "deny" }));
    const lines = fs.readFileSync(store.filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => JSON.parse(line))).toBe(true);
    expect(store.readAll().map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("skips corrupt lines instead of failing the whole log", () => {
    store.append(entry({ id: "a" }));
    fs.appendFileSync(store.filePath, "not-json\n");
    store.append(entry({ id: "b" }));
    expect(store.readAll().map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("filters by agentId, model, decision, and date range", () => {
    store.append(entry({ id: "a", agentId: "a1", agentModel: "m1", decision: "allow", timestamp: "2026-09-10T00:00:00.000Z" }));
    store.append(entry({ id: "b", agentId: "a2", agentModel: "m1", decision: "deny", timestamp: "2026-09-20T00:00:00.000Z" }));
    store.append(entry({ id: "c", agentId: "a1", agentModel: "m2", decision: "deny", timestamp: "2026-09-25T00:00:00.000Z" }));

    expect(store.query({ agentId: "a1", limit: 100 }).total).toBe(2);
    expect(store.query({ model: "m1", limit: 100 }).total).toBe(2);
    expect(store.query({ decision: "deny", limit: 100 }).total).toBe(2);
    expect(
      store.query({ from: "2026-09-15", to: "2026-09-22", limit: 100 }).entries.map((e) => e.id),
    ).toEqual(["b"]);
  });

  it("readLatest and query resolve entries by id, reflecting pending-to-allowed transition", () => {
    store.append(entry({ id: "req-x", decision: "pending", timestamp: "2026-09-20T10:00:00.000Z" }));
    expect(store.query({ decision: "pending" }).total).toBe(1);
    expect(store.query({ decision: "allow" }).total).toBe(0);

    store.append(entry({ id: "req-x", decision: "allow", timestamp: "2026-09-20T10:00:05.000Z" }));
    expect(store.readAll()).toHaveLength(2);
    expect(store.readLatest()).toHaveLength(1);
    expect(store.readLatest()[0]?.decision).toBe("allow");
    expect(store.query({ decision: "pending" }).total).toBe(0);
    expect(store.query({ decision: "allow" }).total).toBe(1);
    expect(store.query({}).total).toBe(1);
  });

  it("searches tool names and serialized input, newest first, honoring limit", () => {
    store.append(entry({ id: "a", name: "bash", input: { command: "rm -rf /tmp/x" }, timestamp: "2026-09-10T00:00:00.000Z" }));
    store.append(entry({ id: "b", name: "read", input: { path: "/etc/hosts" }, timestamp: "2026-09-20T00:00:00.000Z" }));
    const result = store.query({ search: "rm -rf", limit: 100 });
    expect(result.entries.map((e) => e.id)).toEqual(["a"]);
    const limited = store.query({ limit: 1 });
    expect(limited.entries).toHaveLength(1);
    expect(limited.total).toBe(2);
    expect(limited.entries[0]?.id).toBe("b");
  });
});
