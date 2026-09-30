import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DAEMON_HOST,
  loadStoredDaemonToken,
  resolveDaemonHost,
  resolveDaemonHttpUrl,
  resolveDaemonToken,
  resolveDaemonWsUrl,
  splitHostPort,
  storeDaemonToken,
} from "../config.js";

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe("resolveDaemonHost", () => {
  it("defaults to 10.20.30.24:6767", () => {
    expect(DEFAULT_DAEMON_HOST).toBe("10.20.30.24:6767");
    expect(resolveDaemonHost()).toBe("10.20.30.24:6767");
  });

  it("honours VITE_PASEO_DAEMON_HOST", () => {
    vi.stubEnv("VITE_PASEO_DAEMON_HOST", "fleet-box:6767");
    expect(resolveDaemonHost()).toBe("fleet-box:6767");
  });

  it("ignores blank env values", () => {
    vi.stubEnv("VITE_PASEO_DAEMON_HOST", "   ");
    expect(resolveDaemonHost()).toBe(DEFAULT_DAEMON_HOST);
  });
});

describe("resolveDaemonWsUrl", () => {
  it("appends /ws to bare host:port", () => {
    expect(resolveDaemonWsUrl("10.20.30.24:6767")).toBe("ws://10.20.30.24:6767/ws");
    expect(resolveDaemonWsUrl("10.20.30.24:6767/")).toBe("ws://10.20.30.24:6767/ws");
  });

  it("appends /ws to bare ws:// and wss:// urls lacking path or with trailing slash", () => {
    expect(resolveDaemonWsUrl("ws://10.20.30.24:6767")).toBe("ws://10.20.30.24:6767/ws");
    expect(resolveDaemonWsUrl("ws://10.20.30.24:6767/")).toBe("ws://10.20.30.24:6767/ws");
  });

  it("preserves /ws when already present without duplicating it", () => {
    expect(resolveDaemonWsUrl("10.20.30.24:6767/ws")).toBe("ws://10.20.30.24:6767/ws");
    expect(resolveDaemonWsUrl("ws://10.20.30.24:6767/ws")).toBe("ws://10.20.30.24:6767/ws");
    expect(resolveDaemonWsUrl("ws://10.20.30.24:6767/ws/")).toBe("ws://10.20.30.24:6767/ws");
  });

  it("preserves explicit custom path urls", () => {
    expect(resolveDaemonWsUrl("wss://fleet.example/x")).toBe("wss://fleet.example/x");
  });

  it("handles DEFAULT_DAEMON_HOST when called without arguments", () => {
    expect(resolveDaemonWsUrl()).toBe(`ws://${DEFAULT_DAEMON_HOST}/ws`);
  });

  it("respects VITE_PASEO_DAEMON_HOST", () => {
    vi.stubEnv("VITE_PASEO_DAEMON_HOST", "fleet-box:6767");
    expect(resolveDaemonWsUrl()).toBe("ws://fleet-box:6767/ws");
  });

  it("prefers VITE_PASEO_DAEMON_URL and appends /ws when absent", () => {
    vi.stubEnv("VITE_PASEO_DAEMON_URL", "ws://relay:9999");
    expect(resolveDaemonWsUrl("10.20.30.24:6767")).toBe("ws://relay:9999/ws");
  });

  it("respects VITE_PASEO_DAEMON_URL when /ws is already present", () => {
    vi.stubEnv("VITE_PASEO_DAEMON_URL", "ws://relay:9999/ws");
    expect(resolveDaemonWsUrl("10.20.30.24:6767")).toBe("ws://relay:9999/ws");
  });
});

describe("resolveDaemonHttpUrl", () => {
  it("maps ws to http and wss to https while stripping /ws", () => {
    expect(resolveDaemonHttpUrl("10.20.30.24:6767")).toBe("http://10.20.30.24:6767");
    expect(resolveDaemonHttpUrl("ws://10.20.30.24:6767/ws")).toBe("http://10.20.30.24:6767");
    expect(resolveDaemonHttpUrl("wss://fleet.example/x")).toBe("https://fleet.example/x");
    expect(resolveDaemonHttpUrl()).toBe(`http://${DEFAULT_DAEMON_HOST}`);
  });
});

describe("resolveDaemonToken", () => {
  it("returns undefined when neither env nor storage has a token", () => {
    expect(resolveDaemonToken()).toBeUndefined();
  });

  it("prefers VITE_PASEO_DAEMON_TOKEN over the stored token", () => {
    localStorage.setItem("uppidi-fleet.daemon-token", "stored");
    expect(resolveDaemonToken()).toBe("stored");
    vi.stubEnv("VITE_PASEO_DAEMON_TOKEN", "from-env");
    expect(resolveDaemonToken()).toBe("from-env");
  });
});

describe("storeDaemonToken", () => {
  it("round-trips through localStorage and clears on empty", () => {
    storeDaemonToken("secret");
    expect(loadStoredDaemonToken()).toBe("secret");
    storeDaemonToken("");
    expect(loadStoredDaemonToken()).toBeUndefined();
  });
});

describe("splitHostPort", () => {
  it("splits host and port", () => {
    expect(splitHostPort("10.20.30.24:6767")).toEqual({ host: "10.20.30.24", port: 6767 });
  });

  it("falls back to the daemon port for bare hosts", () => {
    expect(splitHostPort("fleet-box")).toEqual({ host: "fleet-box", port: 6767 });
  });
});
