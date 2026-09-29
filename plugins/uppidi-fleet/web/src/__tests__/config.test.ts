import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DAEMON_HOST,
  resolveDaemonHost,
  resolveDaemonHttpUrl,
  resolveDaemonWsUrl,
  splitHostPort,
} from "../config.js";

afterEach(() => {
  vi.unstubAllEnvs();
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
  it("prefixes bare host:port with ws://", () => {
    expect(resolveDaemonWsUrl("10.20.30.24:6767")).toBe("ws://10.20.30.24:6767");
  });

  it("passes explicit ws urls through", () => {
    expect(resolveDaemonWsUrl("wss://fleet.example/x")).toBe("wss://fleet.example/x");
  });

  it("prefers VITE_PASEO_DAEMON_URL", () => {
    vi.stubEnv("VITE_PASEO_DAEMON_URL", "ws://relay:9999");
    expect(resolveDaemonWsUrl("10.20.30.24:6767")).toBe("ws://relay:9999");
  });
});

describe("resolveDaemonHttpUrl", () => {
  it("maps ws to http and wss to https", () => {
    expect(resolveDaemonHttpUrl("10.20.30.24:6767")).toBe("http://10.20.30.24:6767");
    expect(resolveDaemonHttpUrl("wss://fleet.example/x")).toBe("https://fleet.example/x");
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
