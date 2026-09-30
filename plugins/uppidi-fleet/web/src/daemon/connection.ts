import { resolveDaemonHttpUrl, resolveDaemonToken, resolveDaemonWsUrl, storeDaemonToken } from "../config.js";
import { normalizeAgentCategory, type CandidateIssue, type FleetAgentsSnapshot } from "../types.js";

export type FleetTeardownTarget = "workers" | "orchestrators" | "frontdesk";

export const FLEET_TEARDOWN_RPC = "fleet-teardown";

export interface FleetTeardownResult {
  ok: boolean;
  tornDown: Record<FleetTeardownTarget, number>;
  errors: string[];
  message?: string;
  error?: string;
}

export function buildTeardownInput(targets: FleetTeardownTarget[]): { targets: FleetTeardownTarget[]; confirm: true } {
  const unique = [...new Set(targets)];
  if (unique.length === 0) throw new Error("Select at least one teardown target.");
  return { targets: unique, confirm: true as const };
}

interface ConnectionOptions {
  host?: string;
  token?: string;
  onStatus?: (status: ConnectionStatus) => void;
  onEvent?: (event: DaemonEvent) => void;
  onError?: (message: string) => void;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "failed";

export interface DaemonEvent {
  type: string;
  [key: string]: unknown;
}

interface DaemonClientLike {
  connect(): Promise<unknown>;
  close(): Promise<unknown> | unknown;
  invokePluginRpc(pluginId: string, method: string, input: unknown): Promise<unknown>;
  subscribeConnectionStatus?(listener: (status: string) => void): () => void;
  subscribe?(handler: (event: DaemonEvent) => void): () => void;
}

type DaemonClientCtor = new (config: Record<string, unknown>) => DaemonClientLike;

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

/** Turn a dial failure into an actionable dashboard message. */
export function classifyConnectionError(raw: string, wsUrl: string): string {
  if (/password required/i.test(raw)) {
    return "Daemon requires a password: enter the daemon token and reconnect.";
  }
  if (/incorrect password/i.test(raw)) {
    return "Daemon rejected the password: check the token and reconnect.";
  }
  return (
    `Could not reach ${wsUrl}. ` +
    "If the browser blocks the socket, add this dashboard origin to the daemon CORS list " +
    "(PASEO_CORS_ORIGINS) and retry."
  );
}

export class DaemonConnection {
  private status: ConnectionStatus = "disconnected";
  private client: DaemonClientLike | null = null;
  private ctor: DaemonClientCtor | null = null;
  private ctorFailed = false;
  private host: string;
  private token: string | undefined;
  private lastError: string | null = null;
  private onStatus: ((status: ConnectionStatus) => void) | undefined;
  private onEvent: ((event: DaemonEvent) => void) | undefined;
  private onError: ((message: string) => void) | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private closed = false;
  private unsubscribers: Array<() => void> = [];

  constructor(options: ConnectionOptions = {}) {
    this.host = options.host ?? "";
    this.token = options.token;
    this.onStatus = options.onStatus;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  setToken(token: string | undefined): void {
    this.token = token && token.length > 0 ? token : undefined;
  }

  getToken(): string | undefined {
    return this.token ?? resolveDaemonToken();
  }

  getHost(): string {
    return this.host;
  }

  getWsUrl(): string {
    return resolveDaemonWsUrl(this.host || undefined);
  }

  getHttpUrl(): string {
    return resolveDaemonHttpUrl(this.host || undefined);
  }

  private setStatus(next: ConnectionStatus): void {
    this.status = next;
    this.onStatus?.(next);
  }

  /** Backoff schedule shared with tests: capped exponential growth. */
  static backoffForAttempt(attempt: number): number {
    return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(Math.max(0, attempt), 5));
  }

  async connect(host?: string, token?: string): Promise<void> {
    if (host !== undefined) this.host = host;
    if (token !== undefined) {
      this.setToken(token);
      storeDaemonToken(this.token);
    }
    this.closed = false;
    this.reconnectAttempt = 0;
    this.lastError = null;
    this.setStatus("connecting");
    await this.dial();
  }

  private async loadClientCtor(): Promise<DaemonClientCtor | null> {
    if (this.ctor || this.ctorFailed) return this.ctor;
    try {
      const mod = (await import("@getpaseo/client/internal/daemon-client")) as unknown as {
        DaemonClient: DaemonClientCtor;
      };
      this.ctor = mod.DaemonClient;
      return this.ctor;
    } catch {
      this.ctorFailed = true;
      return null;
    }
  }

  private async dial(): Promise<void> {
    if (this.closed) return;
    const Ctor = await this.loadClientCtor();
    if (!Ctor) {
      this.setStatus("failed");
      return;
    }
    try {
      const token = this.token ?? resolveDaemonToken();
      const client = new Ctor({
        url: this.getWsUrl(),
        clientId: `uppidi-fleet-web-${Math.random().toString(36).slice(2, 10)}`,
        clientType: "browser",
        appVersion: "uppidi-fleet-web/0.1.0",
        ...(token ? { password: token } : {}),
        reconnect: { enabled: false },
      });
      const maybeUnsubStatus = client.subscribeConnectionStatus?.((s) => {
        if (s === "connected") {
          this.reconnectAttempt = 0;
          this.setStatus("connected");
        } else if (s === "reconnecting" || s === "connecting") {
          this.setStatus("reconnecting");
        } else if (s === "disconnected" || s === "failed" || s === "closed") {
          this.scheduleReconnect();
        }
      });
      if (maybeUnsubStatus) this.unsubscribers.push(maybeUnsubStatus);
      const maybeUnsubEvents = client.subscribe?.((event) => this.onEvent?.(event));
      if (maybeUnsubEvents) this.unsubscribers.push(maybeUnsubEvents);
      await client.connect();
      this.client = client;
      this.reconnectAttempt = 0;
      this.lastError = null;
      this.setStatus("connected");
    } catch (cause) {
      const raw = cause instanceof Error ? cause.message : String(cause);
      this.lastError = classifyConnectionError(raw, this.getWsUrl());
      this.onError?.(this.lastError);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.setStatus(this.reconnectAttempt === 0 ? "disconnected" : "reconnecting");
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = DaemonConnection.backoffForAttempt(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.dial();
    }, delay);
  }

  async invokeFleetRpc<T>(method: string, input: unknown): Promise<T> {
    if (!this.client) throw new Error("Not connected to the Paseo daemon.");
    const result = await this.client.invokePluginRpc("uppidi-fleet", method, input);
    return result as T;
  }

  async fetchAgents(): Promise<FleetAgentsSnapshot> {
    const raw = await this.invokeFleetRpc<{
      ok: boolean;
      frontdesk?: unknown[];
      orchestrators?: unknown[];
      workers?: unknown[];
      totalCount?: number;
      runningCount?: number;
      idleCount?: number;
      errorCount?: number;
      error?: string;
    }>("agents", {});
    if (!raw || raw.ok !== true) throw new Error(raw?.error ?? "Daemon returned ok=false for uppidi-fleet.agents.");
    const pick = (list: unknown[] | undefined) =>
      (Array.isArray(list) ? list : []).map((entry) => {
        const agent = (entry ?? {}) as Record<string, unknown>;
        return {
          id: String(agent["id"] ?? ""),
          name: String(agent["name"] ?? agent["id"] ?? "unknown"),
          category: normalizeAgentCategory(agent["category"]),
          provider: typeof agent["provider"] === "string" ? agent["provider"] : undefined,
          model: typeof agent["model"] === "string" ? agent["model"] : null,
          deterministicState: (typeof agent["deterministicState"] === "string"
            ? agent["deterministicState"]
            : "unknown") as FleetAgentsSnapshot["workers"][number]["deterministicState"],
          project: typeof agent["project"] === "string" ? agent["project"] : undefined,
          branch: typeof agent["branch"] === "string" ? agent["branch"] : undefined,
          updatedAt: typeof agent["updatedAt"] === "string" ? agent["updatedAt"] : undefined,
          requiresAttention: agent["requiresAttention"] === true,
        };
      });
    const frontdesk = pick(raw.frontdesk);
    const orchestrators = pick(raw.orchestrators);
    const workers = pick(raw.workers);
    const total = raw.totalCount ?? frontdesk.length + orchestrators.length + workers.length;
    return {
      frontdesk,
      orchestrators,
      workers,
      totalCount: total,
      runningCount: raw.runningCount ?? 0,
      idleCount: raw.idleCount ?? 0,
      errorCount: raw.errorCount ?? 0,
    };
  }

  async fetchCandidates(): Promise<CandidateIssue[]> {
    const raw = await this.invokeFleetRpc<{ ok: boolean; issues?: unknown[]; error?: string }>("issues", {
      state: "open",
    });
    if (!raw || raw.ok !== true) throw new Error(raw?.error ?? "Daemon returned ok=false for uppidi-fleet.issues.");
    return (Array.isArray(raw.issues) ? raw.issues : []).map((entry) => {
      const issue = (entry ?? {}) as Record<string, unknown>;
      const status = String(issue["status"] ?? "Backlog");
      return {
        number: Number(issue["number"] ?? 0),
        title: String(issue["title"] ?? ""),
        repo: String(issue["repo"] ?? ""),
        status: (["Backlog", "In progress", "Review", "Done"] as const).includes(
          status as CandidateIssue["status"],
        )
          ? (status as CandidateIssue["status"])
          : "Backlog",
        attention: String(issue["attention"] ?? "attention/1-agent"),
        branch: typeof issue["branch"] === "string" ? issue["branch"] : undefined,
        url: typeof issue["url"] === "string" ? issue["url"] : undefined,
        labels: Array.isArray(issue["labels"]) ? issue["labels"].map(String) : [],
        comments: Number(issue["comments"] ?? 0),
        updatedAt: typeof issue["updatedAt"] === "string" ? issue["updatedAt"] : undefined,
      };
    });
  }

  async teardownFleet(targets: FleetTeardownTarget[]): Promise<FleetTeardownResult> {
    const raw = await this.invokeFleetRpc<{
      ok: boolean;
      tornDown?: Partial<Record<FleetTeardownTarget, number>>;
      errors?: unknown;
      message?: string;
      error?: string;
    }>(FLEET_TEARDOWN_RPC, buildTeardownInput(targets));
    return {
      ok: raw?.ok === true,
      tornDown: {
        workers: Number(raw?.tornDown?.workers ?? 0),
        orchestrators: Number(raw?.tornDown?.orchestrators ?? 0),
        frontdesk: Number(raw?.tornDown?.frontdesk ?? 0),
      },
      errors: Array.isArray(raw?.errors) ? raw.errors.map(String) : [],
      message: raw?.message,
      error: raw?.error,
    };
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const unsub of this.unsubscribers.splice(0)) {
      try {
        unsub();
      } catch {
        // Listener teardown must never break disconnect.
      }
    }
    const client = this.client;
    this.client = null;
    if (client) {
      try {
        await client.close();
      } catch {
        // Close races with daemon shutdown; status still flips below.
      }
    }
    this.setStatus("disconnected");
  }
}
