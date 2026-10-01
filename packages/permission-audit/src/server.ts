import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PERMISSION_AUDIT_FILENAME,
  PERMISSION_AUDIT_PLUGIN_ID,
  PermissionAuditEntrySchema,
  permissionAuditQuery,
  permissionLoggerQuery,
  type PermissionAuditEntry,
  type PermissionDecision,
  type PermissionLogPaths,
  type PermissionQueryFilter,
} from "./shared.js";

export type {
  PermissionAuditEntry,
  PermissionDecision,
  PermissionLogPaths,
  PermissionQueryFilter,
} from "./shared.js";
export {
  PERMISSION_AUDIT_FILENAME,
  PERMISSION_AUDIT_PLUGIN_ID,
  PermissionAuditEntrySchema,
  permissionAuditQuery,
  permissionLoggerQuery,
} from "./shared.js";

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

export interface PermissionLogStoreOptions {
  filePath?: string;
  legacyFilePath?: string;
}

function readJsonlFile(filePath: string): PermissionAuditEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
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

export class PermissionLogStore {
  readonly filePath: string;
  readonly legacyFilePath: string | null;

  constructor(options: PermissionLogStoreOptions = {}) {
    const paths = resolvePermissionLogPaths();
    this.filePath = options.filePath ?? paths.primary;
    if (options.legacyFilePath !== undefined) {
      this.legacyFilePath = options.legacyFilePath;
    } else if (options.filePath) {
      this.legacyFilePath = null;
    } else {
      this.legacyFilePath = paths.legacy;
    }
  }

  append(entry: PermissionAuditEntry): PermissionAuditEntry {
    const validated = PermissionAuditEntrySchema.parse(entry);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(validated)}\n`, "utf8");
    return validated;
  }

  readAll(): PermissionAuditEntry[] {
    const entries: PermissionAuditEntry[] = [];
    if (this.legacyFilePath && this.legacyFilePath !== this.filePath) {
      entries.push(...readJsonlFile(this.legacyFilePath));
    }
    entries.push(...readJsonlFile(this.filePath));
    return entries;
  }

  readLatest(): PermissionAuditEntry[] {
    const byId = new Map<string, PermissionAuditEntry>();
    for (const entry of this.readAll()) {
      byId.set(entry.id, entry);
    }
    return Array.from(byId.values());
  }

  query(filter: PermissionQueryFilter): { entries: PermissionAuditEntry[]; total: number } {
    const fromMs = filter.from ? Date.parse(filter.from) : NaN;
    const toMs = filter.to ? Date.parse(filter.to) : NaN;
    const search = filter.search?.trim().toLowerCase() ?? "";
    const matched = this.readLatest().filter((entry) => {
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

export interface AgentAttribution {
  id?: string;
  title?: string;
  model?: string;
  provider?: string;
  mode?: string;
  cwd?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pickString(sources: Array<Record<string, unknown> | null>, keys: string[]): string | undefined {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const found = asString(source[key]);
      if (found) return found;
    }
  }
  return undefined;
}

export function extractAgentAttribution(agent: unknown): AgentAttribution {
  const root = asRecord(agent);
  if (!root) return {};
  const nested = asRecord(root.agent) ?? asRecord(root.session) ?? null;
  const sources = [root, nested];
  return {
    id: pickString(sources, ["id", "agentId"]),
    title: pickString(sources, ["title", "name"]),
    model: pickString(sources, ["model", "modelId"]),
    provider: pickString(sources, ["provider", "providerId"]),
    mode: pickString(sources, ["modeId", "mode"]),
    cwd: pickString(sources, ["cwd", "workingDirectory", "workdir"]),
  };
}

export function normalizeDecision(raw: unknown): PermissionDecision | null {
  const record = asRecord(raw);
  const candidates: unknown[] = [
    record?.behavior,
    record?.decision,
    record?.verdict,
    record?.approved,
    record?.allowed,
    typeof raw === "string" || typeof raw === "boolean" ? raw : undefined,
  ];
  for (const candidate of candidates) {
    if (candidate === true || candidate === "allow" || candidate === "approve" || candidate === "approved") {
      return "allow";
    }
    if (candidate === false || candidate === "deny" || candidate === "denied" || candidate === "reject") {
      return "deny";
    }
  }
  return null;
}

export interface PendingPermissionRequest {
  id: string;
  timestamp: string;
  agentId?: string;
  kind?: string;
  name?: string;
  input?: unknown;
  attribution?: AgentAttribution;
}

interface ResolveParts {
  requestId?: string;
  agentId?: string;
  kind?: string;
  name?: string;
  input?: unknown;
  updatedInput?: unknown;
  denyReason?: string;
  decision?: PermissionDecision | null;
  attribution?: AgentAttribution;
}

function getAt(record: Record<string, unknown> | null, pathParts: string[]): unknown {
  let current: unknown = record;
  for (const key of pathParts) {
    const next = asRecord(current);
    if (!next) return undefined;
    current = next[key];
  }
  return current;
}

function firstDefined(values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

export function splitResolveEvent(event: unknown, context: unknown): ResolveParts {
  const root = asRecord(event) ?? {};
  const request = asRecord(root.request) ?? asRecord(root.permission) ?? null;
  const response =
    asRecord(root.response) ?? asRecord(root.result) ?? asRecord(root.resolution) ?? null;
  const contextRecord = asRecord(context);
  const contextAgent = contextRecord ? (contextRecord.agent ?? asRecord(contextRecord.paseo)?.agent) : undefined;

  const requestId =
    asString(root.requestId) ??
    asString(request?.id) ??
    asString(request?.requestId) ??
    asString(root.id);
  const decision =
    normalizeDecision(response) ??
    normalizeDecision(root) ??
    normalizeDecision(request) ??
    normalizeDecision(asRecord(root.response) ?? null);

  const attribution = extractAgentAttribution(
    firstDefined([root.agent, request?.agent, response?.agent, contextAgent]) ?? null,
  );

  return {
    requestId,
    agentId:
      asString(root.agentId) ??
      asString(request?.agentId) ??
      asString(response?.agentId) ??
      attribution.id,
    kind: asString(request?.kind) ?? asString(root.kind),
    name:
      asString(request?.name) ??
      asString(request?.title) ??
      asString(request?.tool) ??
      asString(root.name) ??
      asString(root.title),
    input: firstDefined([request?.input, root.input]),
    updatedInput: firstDefined([
      getAt(response, ["updatedInput"]),
      getAt(root, ["updatedInput"]),
      getAt(response, ["updatedPermissions"]),
    ]),
    denyReason:
      asString(response?.message) ??
      asString(response?.denyReason) ??
      asString(response?.reason) ??
      asString(root.message) ??
      asString(root.denyReason),
    decision,
    attribution,
  };
}

export function splitRequestEvent(event: unknown, context: unknown): PendingPermissionRequest | null {
  const root = asRecord(event) ?? {};
  const request = asRecord(root.request) ?? asRecord(root.permission) ?? root;
  const id = asString(request.id) ?? asString(request.requestId) ?? asString(root.requestId);
  if (!id) return null;
  const contextRecord = asRecord(context);
  const contextAgent = contextRecord ? (contextRecord.agent ?? asRecord(contextRecord.paseo)?.agent) : undefined;
  const attribution = extractAgentAttribution(
    firstDefined([root.agent, request.agent, contextAgent]) ?? null,
  );
  return {
    id,
    timestamp: asString(root.timestamp) ?? asString(request.timestamp) ?? new Date().toISOString(),
    agentId: asString(request.agentId) ?? asString(root.agentId) ?? attribution.id,
    kind: asString(request.kind) ?? asString(root.kind),
    name:
      asString(request.name) ??
      asString(request.title) ??
      asString(request.tool) ??
      asString(root.name),
    input: firstDefined([request.input, root.input]),
    attribution,
  };
}

export interface PermissionLoggerOptions {
  store: PermissionLogStore;
  now?: () => string;
  onRecord?: (entry: PermissionAuditEntry) => void;
}

export function createPermissionLogger(options: PermissionLoggerOptions) {
  const { store, onRecord } = options;
  const now = options.now ?? (() => new Date().toISOString());
  const pending = new Map<string, PendingPermissionRequest>();

  function handleRequested(event: unknown, context?: unknown): PermissionAuditEntry | null {
    const parsed = splitRequestEvent(event, context);
    if (!parsed) return null;
    pending.set(parsed.id, parsed);

    const attribution = parsed.attribution ?? {};
    const agentId = parsed.agentId ?? attribution.id;
    if (!parsed.id || !agentId) return null;

    const candidate = {
      id: parsed.id,
      timestamp: parsed.timestamp ?? now(),
      agentId,
      agentTitle: attribution.title,
      agentModel: attribution.model,
      agentProvider: attribution.provider,
      agentMode: attribution.mode,
      agentCwd: attribution.cwd,
      kind: parsed.kind ?? "tool",
      name: parsed.name ?? "permission",
      input: parsed.input ?? null,
      decision: "pending" as const,
    };
    const validated = PermissionAuditEntrySchema.parse(candidate);
    const stored = store.append(validated);
    onRecord?.(stored);
    return stored;
  }

  function handleResolved(event: unknown, context?: unknown): PermissionAuditEntry | null {
    const parts = splitResolveEvent(event, context);
    const prior = parts.requestId ? pending.get(parts.requestId) : undefined;
    if (parts.requestId) pending.delete(parts.requestId);

    const attribution = {
      ...(prior?.attribution ?? {}),
      ...(parts.attribution ?? {}),
    };
    const agentId = parts.agentId ?? prior?.agentId ?? attribution.id;
    const decision = parts.decision;
    const id = parts.requestId ?? prior?.id;
    const kind = parts.kind ?? prior?.kind ?? "tool";
    const name = parts.name ?? prior?.name ?? "permission";
    if (!id || !agentId || !decision) return null;

    const candidate = {
      id,
      timestamp: now(),
      agentId,
      agentTitle: attribution.title,
      agentModel: attribution.model,
      agentProvider: attribution.provider,
      agentMode: attribution.mode,
      agentCwd: attribution.cwd,
      kind,
      name,
      input: firstDefined([parts.input, prior?.input]) ?? null,
      decision,
      updatedInput: parts.updatedInput,
      denyReason: parts.denyReason,
    };
    const parsed = PermissionAuditEntrySchema.parse(candidate);
    const stored = store.append(parsed);
    onRecord?.(stored);
    return stored;
  }

  function handleTurnActivity(event: unknown): PermissionAuditEntry[] {
    const root = asRecord(event);
    const agentId = asString(root?.agentId) ?? asString(asRecord(root?.agent)?.id);
    if (!agentId) return [];
    const resolved: PermissionAuditEntry[] = [];
    for (const [id, req] of pending.entries()) {
      if (req.agentId === agentId) {
        pending.delete(id);
        const attribution = req.attribution ?? {};
        const candidate = {
          id: req.id,
          timestamp: now(),
          agentId,
          agentTitle: attribution.title,
          agentModel: attribution.model,
          agentProvider: attribution.provider,
          agentMode: attribution.mode,
          agentCwd: attribution.cwd,
          kind: req.kind ?? "tool",
          name: req.name ?? "permission",
          input: req.input ?? null,
          decision: "allow" as const,
        };
        const parsed = PermissionAuditEntrySchema.parse(candidate);
        const stored = store.append(parsed);
        onRecord?.(stored);
        resolved.push(stored);
      }
    }
    return resolved;
  }

  return { handleRequested, handleResolved, handleTurnActivity, pending };
}

const REQUESTED_EVENTS = ["agent.permission_requested", "permission.requested"];
const RESOLVED_EVENTS = ["agent.permission_resolved", "permission.resolved"];
const TURN_EVENTS = ["agent.turn_started", "agent.turn_ended"];

interface EventedServer {
  on?: (event: string, handler: (event: unknown, context: unknown) => void) => () => void;
}

export function subscribePermissionEvents(
  server: EventedServer,
  logger: Pick<
    ReturnType<typeof createPermissionLogger>,
    "handleRequested" | "handleResolved" | "handleTurnActivity"
  >,
): () => void {
  if (typeof server.on !== "function") return () => {};
  const offs: Array<() => void> = [];
  for (const name of REQUESTED_EVENTS) {
    try {
      offs.push(server.on(name, (event, context) => logger.handleRequested(event, context)));
    } catch {
      continue;
    }
  }
  for (const name of RESOLVED_EVENTS) {
    try {
      offs.push(server.on(name, (event, context) => logger.handleResolved(event, context)));
    } catch {
      continue;
    }
  }
  for (const name of TURN_EVENTS) {
    try {
      offs.push(server.on(name, (event) => logger.handleTurnActivity(event)));
    } catch {
      continue;
    }
  }
  return () => {
    for (const off of offs) {
      try {
        off();
      } catch {
        continue;
      }
    }
  };
}

export interface PermissionAuditServerOptions {
  filePath?: string;
  now?: () => string;
  onRecord?: (entry: PermissionAuditEntry) => void;
  logger?: { info: (message: string, details?: Record<string, unknown>) => void };
}

interface RpcServer {
  on?: (event: string, handler: (event: unknown, context: unknown) => void) => () => void;
  handle: (contract: { name: string }, handler: (input: any) => unknown) => void;
}

export function registerPermissionAuditServer(server: RpcServer, options: PermissionAuditServerOptions = {}) {
  const store = new PermissionLogStore({ filePath: options.filePath });
  const logger = createPermissionLogger({
    store,
    now: options.now,
    onRecord: options.onRecord ?? ((entry) => {
      options.logger?.info("permission decision logged", {
        id: entry.id,
        agentId: entry.agentId,
        name: entry.name,
        decision: entry.decision,
      });
    }),
  });

  const unsubscribe = subscribePermissionEvents(server, logger);
  const queryHandler = (input: PermissionQueryFilter) => store.query(input);
  server.handle(permissionAuditQuery, queryHandler);
  server.handle(permissionLoggerQuery, queryHandler);

  return { store, logger, unsubscribe };
}
