import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PermissionAuditEntrySchema,
  type PermissionAuditEntry,
  type PermissionQueryFilter,
} from "../shared/contracts.js";

export function resolveDefaultLogPath(): string {
  const override = process.env.PASEO_PERMISSION_LOG_PATH?.trim();
  if (override) return override;
  return path.join(os.homedir(), ".paseo", "logs", "permissions.jsonl");
}

export interface PermissionLogStoreOptions {
  filePath?: string;
}

export class PermissionLogStore {
  readonly filePath: string;

  constructor(options: PermissionLogStoreOptions = {}) {
    this.filePath = options.filePath ?? resolveDefaultLogPath();
  }

  append(entry: PermissionAuditEntry): PermissionAuditEntry {
    const validated = PermissionAuditEntrySchema.parse(entry);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(validated)}\n`, "utf8");
    return validated;
  }

  readAll(): PermissionAuditEntry[] {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, "utf8");
    } catch {
      return [];
    }
    const entries: PermissionAuditEntry[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(PermissionAuditEntrySchema.parse(JSON.parse(trimmed)));
      } catch {
        continue;
      }
    }
    return entries;
  }

  query(filter: PermissionQueryFilter): { entries: PermissionAuditEntry[]; total: number } {
    const fromMs = filter.from ? Date.parse(filter.from) : NaN;
    const toMs = filter.to ? Date.parse(filter.to) : NaN;
    const search = filter.search?.trim().toLowerCase() ?? "";
    const matched = this.readAll().filter((entry) => {
      if (filter.agentId && entry.agentId !== filter.agentId) return false;
      if (filter.model && entry.agentModel !== filter.model) return false;
      if (filter.provider && entry.agentProvider !== filter.provider) return false;
      if (filter.decision && entry.decision !== filter.decision) return false;
      if (filter.kind && entry.kind !== filter.kind) return false;
      const ts = Date.parse(entry.timestamp);
      if (!Number.isNaN(fromMs) && (Number.isNaN(ts) || ts < fromMs)) return false;
      if (!Number.isNaN(toMs) && (Number.isNaN(ts) || ts > toMs)) return false;
      if (search) {
        const haystack = `${entry.name} ${entry.kind} ${entry.agentId} ${JSON.stringify(entry.input ?? null)}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    matched.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    const limit = filter.limit ?? 100;
    return { entries: matched.slice(0, limit), total: matched.length };
  }
}
