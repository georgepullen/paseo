import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once, EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import type { HostRecord } from "../shared/registry.ts";
import { createProxySupervisor, MAX_PROXY_BODY_BYTES } from "./inference-proxy.ts";

const silentLogger = { info: () => {}, warn: () => {} };

function host(overrides: Partial<HostRecord> = {}): HostRecord {
  return {
    id: "host-gpu",
    name: "gpu-box",
    wakeTransports: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  server.close();
  await once(server, "close");
  return port;
}

async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void, port = 0): Promise<{ server: Server; port: number }> {
  const server = createServer(handler);
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return { server, port: (server.address() as AddressInfo).port };
}

async function closeServer(server: Server): Promise<void> {
  const maybe = server as Server & { closeAllConnections?: () => void };
  maybe.closeAllConnections?.();
  server.close();
  await once(server, "close");
}

interface ClientResult {
  status: number;
  headers: IncomingMessage["headers"];
  chunks: string[];
  body: string;
}

function send(port: number, options: { method?: string; path?: string; headers?: Record<string, string>; body?: string } = {}): Promise<ClientResult> {
  return new Promise<ClientResult>((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: options.method ?? "GET",
        path: options.path ?? "/",
        headers: options.headers,
      },
      (res) => {
        const chunks: string[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, chunks, body: chunks.join("") }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (options.body !== undefined) req.end(options.body);
    else req.end();
  });
}

test("proxy forwards method, path, headers, body, status, and streaming chunks when upstream is up", async () => {
  let seen!: { method?: string; url?: string; headers: IncomingMessage["headers"]; body: string };
  const upstream = await startServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      seen = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      res.writeHead(201, { "content-type": "text/plain", "x-upstream": "yes" });
      res.write("chunk-one-");
      setImmediate(() => {
        res.end("chunk-two");
      });
    });
  });
  const listenPort = await freePort();
  let wakeCalls = 0;
  const supervisor = createProxySupervisor({
    startWake: async () => {
      wakeCalls += 1;
    },
    logger: silentLogger,
  });
  try {
    await supervisor.sync([host({ inferenceProxy: { listenPort, upstreamPort: upstream.port } })]);
    const result = await send(listenPort, {
      method: "POST",
      path: "/v1/chat?stream=true",
      headers: {
        "content-type": "application/json",
        "x-custom": "kept",
        "proxy-authorization": "Bearer should-not-forward",
      },
      body: JSON.stringify({ prompt: "hello" }),
    });
    assert.equal(result.status, 201);
    assert.equal(result.headers["x-upstream"], "yes");
    assert.equal(result.body, "chunk-one-chunk-two");
    assert.ok(result.chunks.length >= 2, "response chunks stream through instead of collapsing");
    assert.equal(seen?.method, "POST");
    assert.equal(seen?.url, "/v1/chat?stream=true");
    assert.equal(seen?.body, JSON.stringify({ prompt: "hello" }));
    assert.equal(seen?.headers["x-custom"], "kept");
    assert.equal(seen?.headers["host"], `127.0.0.1:${upstream.port}`);
    assert.equal(seen?.headers["proxy-authorization"], undefined);
    assert.equal(wakeCalls, 0, "an up upstream never triggers a wake");
  } finally {
    await supervisor.stop();
    await closeServer(upstream.server);
  }
});

test("proxy wakes once, holds after the successful retry, and forwards when upstream initially refuses", async () => {
  const upstreamPort = await freePort();
  const listenPort = await freePort();
  const upstreamBox: { current: { server: Server; port: number } | null } = { current: null };
  let wakeCalls = 0;
  let holdCalls = 0;
  const holdEvents = new EventEmitter();
  const holdCalled = once(holdEvents, "called");
  let fakeNow = 0;
  const supervisor = createProxySupervisor({
    startWake: async () => {
      wakeCalls += 1;
      upstreamBox.current = await startServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      }, upstreamPort);
    },
    runCommand: async () => {
      holdCalls += 1;
      holdEvents.emit("called");
    },
    logger: silentLogger,
    now: () => fakeNow,
    sleep: async (ms) => {
      fakeNow += ms;
    },
  });
  try {
    await supervisor.sync([
      host({
        inferenceProxy: { listenPort, upstreamPort, wakeTimeoutSeconds: 30, pollSeconds: 1 },
        holdCommand: { command: "ssh", args: ["gpu-box", "touch", "/tmp/wake-hold"] },
      }),
    ]);
    const result = await send(listenPort, { method: "POST", path: "/v1/models", body: "{}" });
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body), { ok: true });
    assert.equal(wakeCalls, 1);
    await holdCalled;
    assert.equal(holdCalls, 1, "a wake-path success runs the hold command once");
  } finally {
    await supervisor.stop();
    if (upstreamBox.current) await closeServer(upstreamBox.current.server);
  }
});

test("proxy returns the exact 503 host_asleep body after the wake deadline", async () => {
  const upstreamPort = await freePort();
  const listenPort = await freePort();
  let wakeCalls = 0;
  let fakeNow = 0;
  const supervisor = createProxySupervisor({
    startWake: async () => {
      wakeCalls += 1;
    },
    logger: silentLogger,
    now: () => fakeNow,
    sleep: async (ms) => {
      fakeNow += ms;
    },
  });
  try {
    await supervisor.sync([host({ inferenceProxy: { listenPort, upstreamPort, wakeTimeoutSeconds: 10, pollSeconds: 1 } })]);
    const result = await send(listenPort, { path: "/v1/models" });
    assert.equal(result.status, 503);
    assert.equal(
      result.body,
      JSON.stringify({
        error: { message: "gpu-box is asleep and did not wake within 10s", type: "server_error", code: "host_asleep" },
      }),
    );
    assert.equal(wakeCalls, 1, "the wake fires once, not on every poll");
  } finally {
    await supervisor.stop();
  }
});

test("proxy does not resend after an upstream accepts then drops mid-request", async () => {
  let upstreamRequests = 0;
  const upstream = await startServer((req) => {
    upstreamRequests += 1;
    req.socket.destroy();
  });
  const listenPort = await freePort();
  let wakeCalls = 0;
  const supervisor = createProxySupervisor({
    startWake: async () => {
      wakeCalls += 1;
    },
    logger: silentLogger,
  });
  try {
    await supervisor.sync([host({ inferenceProxy: { listenPort, upstreamPort: upstream.port, wakeTimeoutSeconds: 10, pollSeconds: 1 } })]);
    const result = await send(listenPort, { method: "POST", path: "/v1/chat", body: "do-not-duplicate" });
    assert.equal(result.status, 502);
    assert.equal(
      result.body,
      JSON.stringify({
        error: { message: "gpu-box went offline mid-request", type: "server_error", code: "host_offline_midrequest" },
      }),
    );
    assert.equal(upstreamRequests, 1, "the request must never be resent after the flush");
    assert.equal(wakeCalls, 0);
  } finally {
    await supervisor.stop();
    await closeServer(upstream.server);
  }
});

test("a failed listen logs and never throws out of sync", async () => {
  const blocker = await startServer((_req, res) => res.end("busy"));
  const upstream = await startServer((_req, res) => res.end("up"));
  const warnings: string[] = [];
  const supervisor = createProxySupervisor({
    startWake: async () => {},
    logger: { info: () => {}, warn: (message) => warnings.push(message) },
  });
  try {
    await supervisor.sync([host({ inferenceProxy: { listenPort: blocker.port, upstreamPort: upstream.port } })]);
    assert.ok(warnings.some((line) => line.includes(String(blocker.port))), "the listen failure is logged");
  } finally {
    await supervisor.stop();
    await closeServer(blocker.server);
    await closeServer(upstream.server);
  }
});

test("a body over the 32 MiB cap gets a 413 JSON error and never reaches upstream", async () => {
  let upstreamRequests = 0;
  const upstream = await startServer((_req, res) => {
    upstreamRequests += 1;
    res.end("should not happen");
  });
  const listenPort = await freePort();
  const supervisor = createProxySupervisor({ startWake: async () => {}, logger: silentLogger });
  try {
    await supervisor.sync([host({ inferenceProxy: { listenPort, upstreamPort: upstream.port } })]);
    const result = await send(listenPort, { method: "POST", path: "/v1/chat", body: "x".repeat(MAX_PROXY_BODY_BYTES + 1) });
    assert.equal(result.status, 413);
    assert.equal(JSON.parse(result.body).error.code, "request_too_large");
    assert.equal(upstreamRequests, 0);
  } finally {
    await supervisor.stop();
    await closeServer(upstream.server);
  }
});
