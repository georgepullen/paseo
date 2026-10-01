import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { defineContract } from "paseo-plugin-helper/shared";

export const PermissionDecisionSchema = z.enum(["pending", "allow", "deny"]);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const PermissionAuditEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  agentId: z.string().min(1),
  agentTitle: z.string().optional(),
  agentModel: z.string().optional(),
  agentProvider: z.string().optional(),
  agentMode: z.string().optional(),
  agentCwd: z.string().optional(),
  kind: z.string().min(1),
  name: z.string().min(1),
  input: z.unknown(),
  decision: PermissionDecisionSchema,
  updatedInput: z.unknown().optional(),
  denyReason: z.string().optional(),
});
export type PermissionAuditEntry = z.infer<typeof PermissionAuditEntrySchema>;

export const PermissionQueryFilterSchema = z.object({
  agentId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  decision: PermissionDecisionSchema.optional(),
  kind: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
});
export type PermissionQueryFilter = z.input<typeof PermissionQueryFilterSchema>;

const auditQueryOutput = z.object({
  entries: z.array(PermissionAuditEntrySchema),
  total: z.number().int().nonnegative(),
});

export const permissionAuditQuery = defineContract({
  name: "permission-audit.query",
  description: "Query logged permission decisions, filtered by agent, model, date range, or decision",
  input: PermissionQueryFilterSchema,
  output: auditQueryOutput,
});

export const permissionLoggerQuery = defineContract({
  name: "permission-logger.query",
  description: "Query logged permission decisions, filtered by agent, model, date range, or decision",
  input: PermissionQueryFilterSchema,
  output: auditQueryOutput,
});

export const PERMISSION_AUDIT_PLUGIN_ID = "permission-logger";
export const PERMISSION_AUDIT_FILENAME = "permissions.jsonl";

export interface PermissionLogPaths {
  primary: string;
  legacy: string;
}

export function resolvePermissionLogPaths(): PermissionLogPaths {
  const override = process.env.PASEO_PERMISSION_LOG_PATH?.trim();
  const legacy = path.join(os.homedir(), ".paseo", "logs", PERMISSION_AUDIT_FILENAME);
  if (override) return { primary: override, legacy };
  const primary = path.join(
    os.homedir(),
    ".paseo",
    "plugin-data",
    "xpufx",
    PERMISSION_AUDIT_PLUGIN_ID,
    PERMISSION_AUDIT_FILENAME,
  );
  return { primary, legacy };
}

export function resolveDefaultLogPath(): string {
  return resolvePermissionLogPaths().primary;
}
