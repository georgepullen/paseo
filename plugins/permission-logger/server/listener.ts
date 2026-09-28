import {
  PermissionAuditEntrySchema,
  type PermissionAuditEntry,
  type PermissionDecision,
} from "../shared/contracts.js";
import type { PermissionLogStore } from "./storage.js";

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

function getAt(record: Record<string, unknown> | null, path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
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

  function handleRequested(event: unknown, context?: unknown): void {
    const parsed = splitRequestEvent(event, context);
    if (parsed) pending.set(parsed.id, parsed);
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
      timestamp: prior?.timestamp ?? now(),
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

  return { handleRequested, handleResolved, pending };
}

const REQUESTED_EVENTS = ["agent.permission_requested", "permission.requested"];
const RESOLVED_EVENTS = ["agent.permission_resolved", "permission.resolved"];

interface EventedServer {
  on?: (event: string, handler: (event: unknown, context: unknown) => void) => () => void;
}

export function subscribePermissionEvents(
  server: EventedServer,
  logger: Pick<ReturnType<typeof createPermissionLogger>, "handleRequested" | "handleResolved">,
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
