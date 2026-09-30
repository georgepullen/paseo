import { afterEach, describe, expect, it } from "vitest";
import { DaemonConnection, classifyConnectionError } from "../daemon/connection.js";

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
