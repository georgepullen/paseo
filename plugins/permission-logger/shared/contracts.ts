import { z } from "zod";
import { defineContract } from "paseo-plugin-helper/shared";

export const PermissionDecisionSchema = z.enum(["allow", "deny"]);
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
export type PermissionQueryFilter = z.infer<typeof PermissionQueryFilterSchema>;

export const permissionLoggerQuery = defineContract({
  name: "permission-logger.query",
  description: "Query logged permission decisions, filtered by agent, model, date range, or decision",
  input: PermissionQueryFilterSchema,
  output: z.object({
    entries: z.array(PermissionAuditEntrySchema),
    total: z.number().int().nonnegative(),
  }),
});
