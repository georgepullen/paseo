import type { PermissionAuditEntry, PermissionDecision } from "./shared.js";

export type DecisionFilter = "all" | PermissionDecision;

export function formatAuditTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}

export function summarizeAuditInput(input: unknown): string {
  if (input === null || input === undefined) return "—";
  if (typeof input === "string") return input.length > 120 ? `${input.slice(0, 120)}…` : input;
  try {
    const text = JSON.stringify(input);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  } catch {
    return "—";
  }
}

export function filterAuditEntries(
  entries: PermissionAuditEntry[],
  decision: DecisionFilter,
  search: string,
): PermissionAuditEntry[] {
  const needle = search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (decision !== "all" && entry.decision !== decision) return false;
    if (!needle) return true;
    const haystack =
      `${entry.name} ${entry.kind} ${entry.agentId} ${entry.agentModel ?? ""} ${summarizeAuditInput(entry.input)}`.toLowerCase();
    return haystack.includes(needle);
  });
}
