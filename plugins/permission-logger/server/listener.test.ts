import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createPermissionLogger,
  extractAgentAttribution,
  normalizeDecision,
  splitRequestEvent,
  splitResolveEvent,
  subscribePermissionEvents,
} from "./listener";
import { PermissionLogStore } from "./storage";

describe("extractAgentAttribution", () => {
  it("resolves model, provider, mode, and title from agent context", () => {
    expect(
      extractAgentAttribution({
        id: "agent-1",
        title: "worker",
        model: "test-model",
        provider: "test-provider",
        modeId: "build",
        cwd: "/srv/app",
      }),
    ).toMatchObject({
      id: "agent-1",
      title: "worker",
      model: "test-model",
      provider: "test-provider",
      mode: "build",
      cwd: "/srv/app",
    });
  });

  it("handles nested agent envelopes and alternate key names", () => {
    expect(
      extractAgentAttribution({ agent: { agentId: "a9", modelId: "m", providerId: "p", mode: "plan" } }),
    ).toMatchObject({ id: "a9", model: "m", provider: "p", mode: "plan" });
  });

  it("returns empty attribution for non-objects", () => {
    expect(extractAgentAttribution(null)).toEqual({});
    expect(extractAgentAttribution("agent-1")).toEqual({});
  });
});

describe("normalizeDecision", () => {
  it("maps allow/approve variants", () => {
    expect(normalizeDecision({ behavior: "allow" })).toBe("allow");
    expect(normalizeDecision({ decision: "approve" })).toBe("allow");
    expect(normalizeDecision(true)).toBe("allow");
  });

  it("maps deny variants", () => {
    expect(normalizeDecision({ behavior: "deny" })).toBe("deny");
    expect(normalizeDecision({ decision: "denied" })).toBe("deny");
    expect(normalizeDecision(false)).toBe("deny");
  });

  it("returns null for undecidable payloads", () => {
    expect(normalizeDecision({})).toBeNull();
    expect(normalizeDecision(null)).toBeNull();
  });
});

describe("event capture and pairing", () => {
  function setup() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perm-listener-"));
    const store = new PermissionLogStore({ filePath: path.join(dir, "permissions.jsonl") });
    const logger = createPermissionLogger({ store, now: () => "2026-09-28T10:00:00.000Z" });
    return { store, logger };
  }

  it("pairs a requested event with its resolution, keeping request input", () => {
    const { store, logger } = setup();
    const pendingEntry = logger.handleRequested({
      request: { id: "r1", kind: "tool", name: "bash", input: { command: "ls" } },
      agent: { id: "a1", model: "m1", provider: "p1", modeId: "build", cwd: "/srv" },
    });
    expect(pendingEntry).toMatchObject({
      id: "r1",
      agentId: "a1",
      decision: "pending",
    });
    expect(store.query({ decision: "pending" }).total).toBe(1);

    const recorded = logger.handleResolved({
      requestId: "r1",
      response: { behavior: "allow", updatedInput: { command: "ls -la" } },
    });
    expect(recorded).toMatchObject({
      id: "r1",
      agentId: "a1",
      agentModel: "m1",
      kind: "tool",
      name: "bash",
      decision: "allow",
    });
    expect(recorded?.input).toEqual({ command: "ls" });
    expect(store.readAll()).toHaveLength(2);
    expect(store.readLatest()).toHaveLength(1);
    expect(store.query({ decision: "pending" }).total).toBe(0);
    expect(store.query({ decision: "allow" }).total).toBe(1);
  });

  it("records resolutions that arrive without a prior request", () => {
    const { store, logger } = setup();
    const recorded = logger.handleResolved({
      request: { id: "r2", agentId: "a2", kind: "question", name: "ask", input: { q: "deploy?" } },
      response: { behavior: "deny", message: "not now" },
      agent: { id: "a2", title: "frontdesk" },
    });
    expect(recorded).toMatchObject({ id: "r2", agentId: "a2", decision: "deny" });
    expect(recorded?.denyReason).toBe("not now");
    expect(store.readAll()).toHaveLength(1);
  });

  it("reconciles pending permissions on agent turn activity when provider omits resolution event", () => {
    const { store, logger } = setup();
    logger.handleRequested({
      request: { id: "r_opencode", kind: "tool", name: "bash", input: { command: "git status" } },
      agent: { id: "a_opencode", model: "space-bunny", provider: "pufaysokt" },
    });
    expect(store.query({ decision: "pending" }).total).toBe(1);

    // Agent resumes turn without Paseo core firing agent.permission_resolved
    const resolved = logger.handleTurnActivity({ agentId: "a_opencode" });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ id: "r_opencode", decision: "allow" });
    expect(store.query({ decision: "pending" }).total).toBe(0);
    expect(store.query({ decision: "allow" }).total).toBe(1);
  });

  it("drops resolutions with no id, agent, or decision", () => {
    const { store, logger } = setup();
    expect(logger.handleResolved({})).toBeNull();
    expect(logger.handleRequested({})).toBeNull();
    expect(store.readAll()).toHaveLength(0);
  });

  it("splitRequestEvent reads context agent attribution as fallback", () => {
    const parsed = splitRequestEvent(
      { request: { id: "r3", kind: "mode", name: "switch" } },
      { agent: { id: "a3", model: "m3" } },
    );
    expect(parsed?.agentId).toBe("a3");
    expect(parsed?.attribution?.model).toBe("m3");
  });

  it("splitResolveEvent understands flat payloads", () => {
    const parts = splitResolveEvent(
      { id: "r4", agentId: "a4", kind: "tool", name: "write", behavior: "allow" },
      undefined,
    );
    expect(parts).toMatchObject({ requestId: "r4", agentId: "a4", decision: "allow", name: "write" });
  });
});

describe("subscribePermissionEvents", () => {
  it("subscribes to daemon permission topics and unsubscribes cleanly", () => {
    const seen: string[] = [];
    const server = {
      on: (name: string, _handler: (event: unknown, context: unknown) => void) => {
        seen.push(name);
        return () => {};
      },
    };
    const logger = createPermissionLogger({
      store: new PermissionLogStore({ filePath: path.join(os.tmpdir(), "perm-never.jsonl") }),
    });
    const off = subscribePermissionEvents(server, logger);
    expect(seen).toContain("agent.permission_resolved");
    expect(seen).toContain("agent.permission_requested");
    expect(() => off()).not.toThrow();
  });

  it("routes resolved events into the store via the subscribed handler", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perm-sub-"));
    const store = new PermissionLogStore({ filePath: path.join(dir, "permissions.jsonl") });
    const logger = createPermissionLogger({ store });
    const handlers = new Map<string, (event: unknown, context: unknown) => void>();
    const server = {
      on: (name: string, handler: (event: unknown, context: unknown) => void) => {
        handlers.set(name, handler);
        return () => {
          handlers.delete(name);
        };
      },
    };
    subscribePermissionEvents(server, logger);
    handlers.get("agent.permission_resolved")?.(
      { id: "r5", agentId: "a5", kind: "tool", name: "bash", behavior: "deny" },
      undefined,
    );
    expect(store.readAll()).toHaveLength(1);
    expect(store.readAll()[0]).toMatchObject({ id: "r5", decision: "deny" });
  });

  it("is a no-op when the server exposes no event bus", () => {
    const logger = createPermissionLogger({
      store: new PermissionLogStore({ filePath: path.join(os.tmpdir(), "perm-never.jsonl") }),
    });
    expect(() => subscribePermissionEvents({}, logger)()).not.toThrow();
    expect(vi.fn()).toBeDefined();
  });
});
