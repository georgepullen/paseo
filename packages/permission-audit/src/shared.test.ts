import { describe, expect, it } from "vitest";
import {
  PermissionAuditEntrySchema,
  PermissionQueryFilterSchema,
  permissionAuditQuery,
  permissionLoggerQuery,
  resolvePermissionLogPaths,
} from "./shared.js";

describe("permission audit contracts", () => {
  it("validates audit entries and rejects decisions outside the enum", () => {
    const parsed = PermissionAuditEntrySchema.parse({
      id: "r1",
      timestamp: "2026-09-28T10:00:00.000Z",
      agentId: "a1",
      kind: "tool",
      name: "bash",
      input: { command: "ls" },
      decision: "allow",
    });
    expect(parsed.agentId).toBe("a1");
    expect(() =>
      PermissionAuditEntrySchema.parse({
        id: "r1",
        timestamp: "2026-09-28T10:00:00.000Z",
        agentId: "a1",
        kind: "tool",
        name: "bash",
        input: null,
        decision: "maybe",
      }),
    ).toThrow();
  });

  it("exposes the shared query contract alongside the legacy logger contract", () => {
    expect(permissionAuditQuery.name).toBe("permission-audit.query");
    expect(permissionLoggerQuery.name).toBe("permission-logger.query");
    expect(PermissionQueryFilterSchema.parse({}).limit).toBe(100);
  });
});

describe("resolvePermissionLogPaths", () => {
  it("defaults to the plugin-scoped data dir with a legacy fallback", () => {
    const prior = process.env.PASEO_PERMISSION_LOG_PATH;
    delete process.env.PASEO_PERMISSION_LOG_PATH;
    try {
      const paths = resolvePermissionLogPaths();
      expect(paths.primary).toContain(".paseo");
      expect(paths.primary).toContain("plugin-data");
      expect(paths.primary.endsWith("permissions.jsonl")).toBe(true);
      expect(paths.legacy).toContain("logs");
      expect(paths.primary).not.toBe(paths.legacy);
    } finally {
      if (prior !== undefined) process.env.PASEO_PERMISSION_LOG_PATH = prior;
    }
  });

  it("honors the explicit path override", () => {
    const prior = process.env.PASEO_PERMISSION_LOG_PATH;
    process.env.PASEO_PERMISSION_LOG_PATH = "/tmp/custom-perms.jsonl";
    try {
      expect(resolvePermissionLogPaths().primary).toBe("/tmp/custom-perms.jsonl");
    } finally {
      if (prior !== undefined) {
        process.env.PASEO_PERMISSION_LOG_PATH = prior;
      } else {
        delete process.env.PASEO_PERMISSION_LOG_PATH;
      }
    }
  });
});
