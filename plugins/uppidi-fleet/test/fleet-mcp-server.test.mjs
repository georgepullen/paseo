import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "../bin/fleet-mcp-server.mjs");

function createMcpProcess() {
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  let nextId = 1;
  const pending = new Map();

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) return;
    try {
      const msg = JSON.parse(trimmed);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch {
      // ignore
    }
  });

  function request(method, params) {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, { resolve });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  function close() {
    child.kill();
  }

  return { request, close };
}

describe("bin/fleet-mcp-server.mjs MCP server", () => {
  test("handles initialize handshake", async () => {
    const client = createMcpProcess();
    try {
      const res = await client.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      });
      assert.equal(res.result.protocolVersion, "2024-11-05");
      assert.equal(res.result.serverInfo.name, "uppidi-fleet");
      assert.ok(res.result.capabilities.tools);
    } finally {
      client.close();
    }
  });

  test("handles ping", async () => {
    const client = createMcpProcess();
    try {
      const res = await client.request("ping", {});
      assert.deepEqual(res.result, {});
    } finally {
      client.close();
    }
  });

  test("lists available fleet tools via tools/list", async () => {
    const client = createMcpProcess();
    try {
      const res = await client.request("tools/list", {});
      assert.ok(Array.isArray(res.result.tools));
      const names = res.result.tools.map((t) => t.name);
      assert.ok(names.includes("fleet_check_board"));
      assert.ok(names.includes("fleet_watchdog_audit"));
    } finally {
      client.close();
    }
  });

  test("returns error for unknown method", async () => {
    const client = createMcpProcess();
    try {
      const res = await client.request("nonexistent/method", {});
      assert.equal(res.error.code, -32601);
      assert.match(res.error.message, /Method not found/);
    } finally {
      client.close();
    }
  });
});
