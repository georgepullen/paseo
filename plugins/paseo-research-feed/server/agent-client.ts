import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createPluginLogger } from "paseo-plugin-helper/server";
import type { AgentVendor } from "../shared/settings.ts";

/**
 * Minimal vendor-agnostic Agent Client Protocol (ACP) client.
 *
 * This is THE one seam the whole plugin uses to reason: the scout's ranking,
 * lazy digests, the mentor's discussion + experiment shaping, and queued-run
 * execution all go through `runAgent` — one auth path (each native agent's own
 * ambient login), one thing to maintain. Vendor swap = one VENDORS entry.
 *
 * The client spawns the adapter (`npx -y @agentclientprotocol/<adapter>`),
 * speaks newline-delimited JSON-RPC over stdio, auto-approves permission
 * prompts (unattended use), and returns the agent's final assistant text. It
 * carries no credentials of any kind; the adapter's own login is used.
 *
 * Set RESEARCH_FEED_STUB=1 to short-circuit every agent call with a
 * deterministic reply (offline development / CI).
 */

const log = createPluginLogger("paseo-research-feed", { subsystem: "agent-client" });

/** Swapping vendor is this ONE config entry. */
export const VENDORS: Record<AgentVendor, { command: string; args: string[] }> = {
  claude: { command: "npx", args: ["-y", "@agentclientprotocol/claude-agent-acp"] },
  codex: { command: "npx", args: ["-y", "@agentclientprotocol/codex-acp"] },
};

export function isStubMode(): boolean {
  return process.env.RESEARCH_FEED_STUB === "1";
}

export interface AgentRunOptions {
  vendor: AgentVendor;
  prompt: string;
  /** Working directory the agent operates in. */
  cwd?: string;
  /** ms before the wedged handshake/turn is killed. */
  timeoutMs?: number;
  /** Auto-allow permission prompts (default true, for unattended use). */
  autoApprove?: boolean;
  /** Live streamed assistant text. */
  onChunk?: (text: string) => void;
}

export interface AgentRunResult {
  text: string;
  stopReason: string;
}

const rpcMessageSchema = z.object({
  id: z.number().optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});
type RpcMessage = z.infer<typeof rpcMessageSchema>;

const initResultSchema = z.object({
  authMethods: z.array(z.object({ id: z.string().optional() })).optional(),
});

const sessionNewResultSchema = z.object({ sessionId: z.string() });

const promptResultSchema = z.object({ stopReason: z.string().optional() });

const permissionParamsSchema = z.object({
  options: z.array(z.object({ kind: z.string().optional(), optionId: z.string().optional() })).optional(),
});

const readFileParamsSchema = z.object({
  path: z.string(),
  line: z.number().optional(),
  limit: z.number().optional(),
});

const writeFileParamsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const updateNotificationSchema = z.object({
  update: z
    .object({
      sessionUpdate: z.string().optional(),
      content: z.object({ text: z.string().optional() }).optional(),
    })
    .optional(),
});

const DEFAULT_TIMEOUT_MS = 300_000;

interface PendingRequest {
  resolvers: PromiseWithResolvers<unknown>;
}

/** Run one turn against a native ACP agent and return its final text. */
export function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { vendor, prompt, cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS, autoApprove = true, onChunk } = options;
  const spec = VENDORS[vendor];
  if (!spec) return Promise.reject(new Error(`unknown vendor: ${vendor}`));
  if (!prompt) return Promise.reject(new Error("prompt is required"));

  if (isStubMode()) {
    return Promise.resolve({ text: stubReply(prompt), stopReason: "stub" });
  }

  // Strip the nested-session guard so the vendor agent can launch as a
  // subprocess of the daemon.
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  const child = spawn(spec.command, spec.args, { cwd, stdio: ["pipe", "pipe", "pipe"], env });
  let nextId = 1;
  const pending = new Map<number, PendingRequest>();
  let buffer = "";
  let assistantText = "";

  const send = (message: object) => {
    child.stdin.write(JSON.stringify(message) + "\n");
  };

  const request = (method: string, params: unknown): Promise<unknown> => {
    const id = nextId++;
    send({ jsonrpc: "2.0", id, method, params });
    const entry = Promise.withResolvers<unknown>();
    pending.set(id, { resolvers: entry });
    return entry.promise;
  };

  const respond = (id: number, result: unknown) => send({ jsonrpc: "2.0", id, result });
  const respondErr = (id: number, code: number, message: string) =>
    send({ jsonrpc: "2.0", id, error: { code, message } });

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const parsed = rpcMessageSchema.safeParse(safeJsonParse(line));
      if (parsed.success) handleMessage(parsed.data);
    }
  });

  child.stderr.on("data", (data: Buffer) => {
    log.debug("adapter stderr", { text: data.toString("utf8").slice(0, 2000) });
  });

  function handleMessage(message: RpcMessage): void {
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.resolvers.reject(new Error(JSON.stringify(message.error)));
      else entry.resolvers.resolve(message.result);
      return;
    }
    if (message.method && message.id !== undefined) {
      handleAgentRequest(message);
      return;
    }
    if (message.method) handleNotification(message);
  }

  function handleAgentRequest(message: RpcMessage): void {
    const { id, method } = message;
    try {
      if (method === "session/request_permission") {
        if (!autoApprove) {
          respond(id, { outcome: { outcome: "cancelled" } });
          return;
        }
        const params = permissionParamsSchema.safeParse(message.params);
        const opts = params.success ? (params.data.options ?? []) : [];
        const pick = opts.find((option) => /allow/i.test(option.kind ?? "")) ?? opts[0];
        respond(id, { outcome: pick ? { outcome: "selected", optionId: pick.optionId } : { outcome: "cancelled" } });
        return;
      }
      if (method === "fs/read_text_file") {
        const params = readFileParamsSchema.parse(message.params);
        let text = fs.readFileSync(params.path, "utf8");
        if (params.line !== undefined || params.limit !== undefined) {
          const lines = text.split("\n");
          const start = params.line ? params.line - 1 : 0;
          text = lines.slice(start, params.limit !== undefined ? start + params.limit : undefined).join("\n");
        }
        respond(id, { content: text });
        return;
      }
      if (method === "fs/write_text_file") {
        const params = writeFileParamsSchema.parse(message.params);
        fs.mkdirSync(path.dirname(params.path), { recursive: true });
        fs.writeFileSync(params.path, params.content);
        respond(id, null);
        return;
      }
      respondErr(id, -32601, `method not found: ${method ?? "?"}`);
    } catch (error) {
      respondErr(id, -32000, String((error as Error)?.message ?? error));
    }
  }

  function handleNotification(message: RpcMessage): void {
    if (message.method !== "session/update") return;
    const parsed = updateNotificationSchema.safeParse(message.params);
    if (!parsed.success) return;
    const update = parsed.data.update;
    const text = update?.content?.text;
    if (update?.sessionUpdate === "agent_message_chunk" && typeof text === "string" && text.length > 0) {
      assistantText += text;
      onChunk?.(text);
    }
  }

  const completion = Promise.withResolvers<AgentRunResult>();
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    completion.reject(new Error("ACP_TIMEOUT: handshake/turn wedged"));
  }, timeoutMs);
  const fail = (error: Error) => {
    clearTimeout(timer);
    child.kill("SIGKILL");
    completion.reject(error);
  };
  child.on("error", fail);

  void (async () => {
    const initRaw = await request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
      clientInfo: { name: "paseo-research-feed", title: "Paseo Research Feed", version: "0.1.0" },
    });
    const init = initResultSchema.parse(initRaw ?? {});

    let sessionId: string;
    try {
      const sessionNew = sessionNewResultSchema.parse(await request("session/new", { cwd, mcpServers: [] }));
      sessionId = sessionNew.sessionId;
    } catch (error) {
      const methods = init.authMethods ?? [];
      if (/auth/i.test(String((error as Error)?.message)) && methods.length > 0) {
        // Native ambient login missing/expired. Never attempt interactive login.
        throw new Error(
          `BLOCKED_AUTH: ${vendor} needs a valid login (offers: ${methods.map((m) => m.id ?? "?").join(",")}). ` +
            "Run the vendor's native login and retry.",
        );
      }
      throw error;
    }

    const promptResult = promptResultSchema.parse(
      await request("session/prompt", { sessionId, prompt: [{ type: "text", text: prompt }] }),
    );
    clearTimeout(timer);
    child.kill("SIGTERM");
    completion.resolve({ text: assistantText, stopReason: promptResult.stopReason ?? "end_turn" });
  })().catch(fail);

  return completion.promise;
}

function safeJsonParse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/** Deterministic offline reply so the whole pipeline runs without any login. */
function stubReply(prompt: string): string {
  const askedForJson = prompt.includes("ONLY a single JSON value") || prompt.includes("Reply JSON");
  if (askedForJson) {
    return [
      "```json",
      '{"stub": true, "digest": "Stub digest.", "questions": ["Stub question?"], "hypothesis": "Stub hypothesis.",',
      '"method": "Stub method.", "gpuBudgetMin": 15, "successMetric": "stub metric", "frontierClaim": "stub claim"}',
      "```",
    ].join("\n");
  }
  return "Stub agent reply (RESEARCH_FEED_STUB=1): no live agent was contacted.";
}
