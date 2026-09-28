import { describe, expect, it } from "vitest";
import {
  PermissionAuditEntrySchema,
  PermissionQueryFilterSchema,
  permissionLoggerQuery,
} from "./contracts";

const BASE_ENTRY = {
  id: "req-1",
  timestamp: "2026-09-28T10:00:00.000Z",
  agentId: "agent-1",
  kind: "tool",
  name: "bash",
  input: { command: "ls" },
  decision: "allow",
} as const;

describe("PermissionAuditEntrySchema", () => {
  it("parses a minimal valid entry", () => {
    const parsed = PermissionAuditEntrySchema.parse({ ...BASE_ENTRY });
    expect(parsed.agentId).toBe("agent-1");
    expect(parsed.decision).toBe("allow");
  });

  it("parses a fully attributed deny entry", () => {
    const parsed = PermissionAuditEntrySchema.parse({
      ...BASE_ENTRY,
      decision: "deny",
      agentTitle: "worker",
      agentModel: "test-model",
      agentProvider: "test-provider",
      agentMode: "build",
      agentCwd: "/srv/app",
      updatedInput: { command: "ls -la" },
      denyReason: "too broad",
    });
    expect(parsed.agentModel).toBe("test-model");
    expect(parsed.denyReason).toBe("too broad");
  });

  it("rejects unknown decisions and missing ids", () => {
    expect(() => PermissionAuditEntrySchema.parse({ ...BASE_ENTRY, decision: "maybe" })).toThrow();
    expect(() => PermissionAuditEntrySchema.parse({ ...BASE_ENTRY, id: "" })).toThrow();
    expect(() => PermissionAuditEntrySchema.parse({ ...BASE_ENTRY, agentId: "" })).toThrow();
  });
});

describe("PermissionQueryFilterSchema", () => {
  it("defaults limit to 100", () => {
    expect(PermissionQueryFilterSchema.parse({}).limit).toBe(100);
  });

  it("accepts agent, model, date range, and decision filters", () => {
    const parsed = PermissionQueryFilterSchema.parse({
      agentId: "a1",
      model: "m1",
      decision: "deny",
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(parsed.agentId).toBe("a1");
    expect(parsed.decision).toBe("deny");
  });
});

describe("permissionLoggerQuery contract", () => {
  it("uses the permission-logger.query RPC name", () => {
    expect(permissionLoggerQuery.name).toBe("permission-logger.query");
  });
});
