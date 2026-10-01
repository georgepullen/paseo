import { afterEach, describe, expect, it, vi } from "vitest";
import { DaemonConnection, classifyConnectionError } from "../daemon/connection.js";

const nativeClient = vi.hoisted(() => {
  const subscription = {
    subscribe: vi.fn(() => () => undefined),
    release: vi.fn(async () => undefined),
  };
  return {
    connect: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    agents: {
      list: vi.fn(async (options?: { subscribe?: Record<string, never> }) => ({
        entries: options?.subscribe
          ? [{ agent: { id: "fd-1", name: "Fleet Front Desk", category: "front-desk", status: "running" } }]
          : [{ agent: { id: "fd-1", name: "Fleet Front Desk", category: "front-desk", status: "running" } }],
        subscription: options?.subscribe ? subscription : undefined,
      })),
      ref: vi.fn(() => ({ archive: vi.fn(async () => undefined) })),
    },
    workspaces: {
      list: vi.fn(async (options?: { subscribe?: Record<string, never> }) => ({
        entries: [{ cwd: "/workspace/paseo" }],
        subscription: options?.subscribe ? subscription : undefined,
      })),
    },
    searchForge: vi.fn(async () => ({
      items: [{ number: 829, title: "native", url: "https://forge/issues/829", state: "open", labels: ["state/1-wip"], projectPath: "xpufx-org/paseo", updatedAt: "now" }],
    })),
  };
});

vi.mock("@getpaseo/client", () => ({ createPaseoClient: () => nativeClient }));

describe("classifyConnectionError", () => {
  const wsUrl = "ws://10.20.30.24:6767/ws";

  it("maps a missing password to a token prompt", () => {
    expect(classifyConnectionError("Password required", wsUrl)).toBe(
      "Daemon requires a password: enter the daemon token and reconnect.",
    );
  });

  it("maps a wrong password to a token check", () => {
    expect(classifyConnectionError("Incorrect password", wsUrl)).toBe(
      "Daemon rejected the password: check the token and reconnect.",
    );
  });

  it("maps anything else to a reachability/hostname hint naming the ws url", () => {
    const message = classifyConnectionError("socket hang up", wsUrl);
    expect(message).toContain(wsUrl);
    expect(message).toContain("daemon.hostnames / PASEO_HOSTNAMES");
  });
});

describe("DaemonConnection token plumbing", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("starts with no last error and resolves urls from the host", () => {
    const connection = new DaemonConnection({ host: "10.20.30.24:6767" });
    expect(connection.getLastError()).toBeNull();
    expect(connection.getWsUrl()).toBe("ws://10.20.30.24:6767/ws");
    expect(connection.getHttpUrl()).toBe("http://10.20.30.24:6767");
  });

  it("setToken normalises blanks to undefined", () => {
    const connection = new DaemonConnection({ host: "10.20.30.24:6767", token: "secret" });
    expect(connection.getToken()).toBe("secret");
    connection.setToken("");
    expect(connection.getToken()).toBeUndefined();
  });

  it("falls back to the stored token when none is passed", () => {
    localStorage.setItem("uppidi-fleet.daemon-token", "stored-secret");
    const connection = new DaemonConnection({ host: "10.20.30.24:6767" });
    expect(connection.getToken()).toBe("stored-secret");
  });
});

describe("native daemon data flow", () => {
  it("uses native agent/workspace subscriptions and Forge search without plugin RPCs", async () => {
    const events: string[] = [];
    const connection = new DaemonConnection({ host: "10.20.30.24:6767", onEvent: (event) => events.push(event.type) });
    await connection.connect();

    await expect(connection.fetchAgents()).resolves.toMatchObject({
      totalCount: 1,
      frontdesk: [{ id: "fd-1", category: "frontdesk" }],
    });
    await expect(connection.fetchCandidates()).resolves.toEqual([
      expect.objectContaining({ number: 829, status: "In progress", repo: "paseo" }),
    ]);
    expect(nativeClient.agents.list).toHaveBeenCalledWith({ subscribe: {} });
    expect(nativeClient.workspaces.list).toHaveBeenCalledWith({ subscribe: {} });
    expect(nativeClient.searchForge).toHaveBeenCalledWith({ cwd: "/workspace/paseo", query: "", limit: 50, kinds: ["issue"] });
    expect(events).toEqual([]);
    await connection.disconnect();
  });
});
