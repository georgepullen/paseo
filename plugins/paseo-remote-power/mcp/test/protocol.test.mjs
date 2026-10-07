// Hermetic protocol tests for the embedded paseo-remote-power MCP server.
//
// Everything runs against a temp state dir; never the operator's real
// ~/.paseo, never a real network. The correctness bar is twofold: the
// official MCP SDK client (the same client every agent runtime uses) must be
// able to drive the tools, and this dependency-free server's vocabulary,
// validators, and packet builder must stay identical to the plugin server's —
// pinned here so the two cannot drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { createInterface } from "node:readline";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ACTIVE_JOB_STATUSES,
  DEFAULT_MAX_CONCURRENT_WAKES,
  DEFAULT_PROBE_TIMEOUT_SECONDS,
  DEFAULT_WAKE_WINDOW_SECONDS,
  FAILURE_MODES,
  JOB_STATUSES,
  HOST_STATES,
  WAKE_POLL_INTERVAL_MS,
  TRANSPORT_TIMEOUT_MS,
  MICROLINK_DEFAULT_PORT,
  SERVER_NAME,
  SERVER_VERSION,
  buildMagicPacket,
  buildWakeDatagram,
  createMethodHandler,
  createPowerTools,
  createWakeEngine,
  describeTransport,
  handleLine,
  probeHost,
  replyAccepted,
  saveJobs,
  signWake,
  stateDir,
  validateHostRecord,
  validateWakeTransport,
} from "../paseo-remote-power.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..", "paseo-remote-power.mjs");

async function startClient(stateDirPath) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, PASEO_REMOTE_POWER_STATE_DIR: stateDirPath },
    stderr: "inherit",
  });
  const client = new Client({ name: "paseo-remote-power-test", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function stopClient({ client, transport }) {
  await client.close();
  await transport.close();
}

function tempState(hosts = []) {
  const dir = mkdtempSync(join(tmpdir(), "remote-power-mcp-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "hosts.json"), `${JSON.stringify({ hosts }, null, 2)}\n`);
  return dir;
}

/** A host whose probes and wake transports are real local child processes. */
function hermeticHost(id = "host-buildbox") {
  return {
    id,
    name: "build-box",
    wakeTransports: [{ type: "command", command: process.execPath, args: ["-e", "process.exit(0)"] }],
    createdAt: 1,
    updatedAt: 1,
  };
}

async function callTool(client, name, args) {
  return client.callTool({ name, arguments: args });
}

/** Wait (bounded) until a wake job reaches a terminal state. */
async function settleJob(engine, jobId) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const job = engine.job(jobId);
    if (job && job.endedAt !== null) return job;
    // A real hermetic child must get wall-clock time to exit; bare
    // setImmediate ticks can exhaust before the spawn's exit event fires.
    await new Promise((resolveTick) => setTimeout(resolveTick, 5));
  }
  return engine.job(jobId);
}

test("stateDir mirrors the plugin storage layout unless overridden", () => {
  assert.match(stateDir(), /\.paseo[\\/]plugin-data[\\/]xpufx[\\/]paseo-remote-power$/);
});

test("the tool vocabulary matches the plugin server exactly", () => {
  assert.deepEqual(JOB_STATUSES, ["starting", "waking", "verifying", "up", "failed"]);
  assert.deepEqual(ACTIVE_JOB_STATUSES, ["starting", "waking", "verifying"]);
  assert.deepEqual(FAILURE_MODES, ["no-transport", "never-reachable", "saturated", "unknown-host"]);
  assert.deepEqual(HOST_STATES, ["up", "down", "unknown"]);
  assert.equal(DEFAULT_WAKE_WINDOW_SECONDS, 110);
  assert.equal(WAKE_POLL_INTERVAL_MS, 3_000);
  assert.equal(TRANSPORT_TIMEOUT_MS, 30_000);
  assert.equal(DEFAULT_PROBE_TIMEOUT_SECONDS, 8);
  assert.equal(DEFAULT_MAX_CONCURRENT_WAKES, 2);
});

test("the mirrored validators agree with the zod schemas on good and bad shapes", () => {
  assert.equal(validateWakeTransport({ type: "http", url: "http://192.0.2.10/wake", tokenRef: "tok" }), null);
  assert.equal(validateWakeTransport({ type: "wol", mac: "00:11:22:33:44:55" }), null);
  assert.equal(validateWakeTransport({ type: "command", command: "wake", args: ["--port", "9"] }), null);
  assert.equal(validateWakeTransport({ type: "microlink", host: "wake.tailnet.net" }), null);
  assert.equal(validateWakeTransport({ type: "microlink", host: "192.0.2.5", mode: "udp", secretRef: "wake-secret", port: 48320 }), null);
  assert.equal(validateWakeTransport({ type: "microlink", host: "192.0.2.5", scheme: "Legacy-HMAC", headerPrefix: "X-Legacy-" }), null);
  assert.match(validateWakeTransport({ type: "carrier-pigeon" }), /type must be/);
  assert.match(validateWakeTransport({ type: "wol", mac: "nope" }), /MAC/);
  assert.match(validateWakeTransport({ type: "microlink" }), /needs a host/);
  assert.match(validateWakeTransport({ type: "microlink", host: "h", mode: "carrier-pigeon" }), /http or udp/);
  assert.match(validateWakeTransport({ type: "microlink", host: "h", port: 70000 }), /between 1 and 65535/);
  assert.match(validateWakeTransport({ type: "microlink", host: "h", scheme: "" }), /scheme/);
  assert.match(validateWakeTransport({ type: "microlink", host: "h", scheme: "x".repeat(65) }), /scheme/);
  assert.match(validateWakeTransport({ type: "microlink", host: "h", headerPrefix: "" }), /headerPrefix/);
  assert.match(validateWakeTransport({ type: "microlink", host: "h", headerPrefix: "x".repeat(65) }), /headerPrefix/);
  assert.equal(validateHostRecord(hermeticHost()), null);
  assert.equal(validateHostRecord({ ...hermeticHost(), wakeTransports: [{ type: "microlink", host: "wake.tailnet.net" }] }), null);
  assert.match(validateHostRecord({ ...hermeticHost(), wakeWindowSeconds: 1 }), /between 10 and 3600/);
  assert.match(validateHostRecord({ ...hermeticHost(), wakeTransports: [{ type: "nope" }] }), /transport type/);
});

test("the magic packet builder matches the plugin server byte for byte", () => {
  const packet = buildMagicPacket("00:11:22:33:44:55");
  assert.equal(packet.length, 102);
  assert.equal(packet.subarray(0, 6).toString("hex"), "ffffffffffff");
  for (let repeat = 0; repeat < 16; repeat++) {
    assert.equal(packet.subarray(6 + repeat * 6, 12 + repeat * 6).toString("hex"), "001122334455");
  }
  assert.equal(buildMagicPacket("zz"), null);
});

test("signWake matches the plugin server's golden transcript byte for byte", () => {
  // The same fixed transcript/key the TS suite pins in server/microlink.test.ts.
  const SECRET_HEX = "00112233445566778899aabbccddeeff";
  const FIXED_TS = 1_700_000_000;
  const FIXED_NONCE = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
  const digest = createHash("sha256").update("", "utf8").digest("hex");
  const transcript = `POST\n/v1/wake\n${FIXED_TS}\n${FIXED_NONCE}\n${digest}`;
  const expectedAuthorization = `Microlink-HMAC ${createHmac("sha256", Buffer.from(SECRET_HEX, "hex")).update(transcript, "utf8").digest("hex")}`;

  const sig = signWake(SECRET_HEX, "POST", "/v1/wake", "", {
    now: () => FIXED_TS,
    nonce: () => FIXED_NONCE,
  });
  assert.equal(sig.ts, "1700000000");
  assert.equal(sig.nonce, FIXED_NONCE);
  assert.equal(sig.nonce.length, 32);
  assert.equal(sig.digest, digest);
  assert.equal(sig.digest, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sig.authorization, expectedAuthorization);
  assert.equal(sig.authorization.includes(SECRET_HEX), false, "the signature never carries the raw secret");

  // pinned legacy authority names
  const legacySig = signWake(SECRET_HEX, "POST", "/v1/wake", "", {
    now: () => FIXED_TS,
    nonce: () => FIXED_NONCE,
    scheme: "Cyril-HMAC",
    headerPrefix: "X-Cyril-",
  });
  assert.equal(legacySig.authorization, `Cyril-HMAC ${createHmac("sha256", Buffer.from(SECRET_HEX, "hex")).update(transcript, "utf8").digest("hex")}`);
});

test("the wake datagram and reply parse match the plugin server byte for byte", () => {
  const sig = signWake("00112233445566778899aabbccddeeff", "POST", "/v1/wake", "", {
    now: () => 1_700_000_000,
    nonce: () => "0f1e2d3c4b5a69788796a5b4c3d2e1f0",
  });
  const expected = `POST /v1/wake\n${sig.ts}\n${sig.nonce}\n${sig.digest}\n${sig.authorization}`;
  assert.equal(buildWakeDatagram(sig), expected);

  assert.equal(replyAccepted(Buffer.from('{"accepted":true}\n', "utf8")), true);
  assert.equal(replyAccepted(Buffer.from('{"accepted":false}\n', "utf8")), false);
  assert.equal(replyAccepted(Buffer.from('{"accepted": "true"}', "utf8")), false);
  assert.equal(replyAccepted(Buffer.from("noise {\"accepted\":true} noise", "utf8")), true);
  assert.equal(replyAccepted(Buffer.from("total garbage", "utf8")), false);
  assert.equal(replyAccepted(null), false);
});

test("describeTransport renders microlink like the plugin server", () => {
  assert.equal(describeTransport({ type: "microlink", host: "wake.tailnet.net" }), "microlink(wake.tailnet.net:48320 http Microlink-HMAC)");
  assert.equal(describeTransport({ type: "microlink", host: "192.0.2.5", port: 49152, mode: "udp" }), "microlink(192.0.2.5:49152 udp Microlink-HMAC)");
  assert.equal(describeTransport({ type: "microlink", host: "wake.tailnet.net", scheme: "Legacy-HMAC" }), "microlink(wake.tailnet.net:48320 http Legacy-HMAC)");
  assert.equal(MICROLINK_DEFAULT_PORT, 48320);
});

test("probeHost consults a microlink host's observer before ssh, like the plugin server", async () => {
  const spawnCalls = [];
  const spawnImpl = async (command) => {
    spawnCalls.push(command);
    return { code: 0 };
  };
  const host = {
    id: "host-wake",
    name: "wake-box",
    sshTarget: "build.example.net",
    wakeTransports: [{ type: "microlink", host: "wake.tailnet.net", port: 49152 }],
    createdAt: 0,
    updatedAt: 0,
  };

  const up = await probeHost(host, { spawnImpl, observeImpl: async () => ({ targetAwake: true }) });
  assert.deepEqual(up, { state: "up", probedVia: "observer" });
  assert.deepEqual(spawnCalls, [], "a definitive observer answer means ssh never runs");

  const down = await probeHost(host, { spawnImpl, observeImpl: async () => ({ targetAwake: false }) });
  assert.deepEqual(down, { state: "down", probedVia: "observer" });

  const fallthrough = await probeHost(host, { spawnImpl, observeImpl: async () => null });
  assert.deepEqual(fallthrough, { state: "up", probedVia: "ssh" }, "ssh answers after the observer stays silent");
  assert.deepEqual(spawnCalls, ["ssh"]);

  const sshOnly = await probeHost(
    { ...host, wakeTransports: [{ type: "wol", mac: "00:11:22:33:44:55" }] },
    { spawnImpl, observeImpl: async () => ({ targetAwake: true }) },
  );
  assert.equal(sshOnly.probedVia, "ssh", "a host without a microlink transport keeps the ssh channel");

  const statusWins = await probeHost(
    { ...host, statusCommand: { command: "true" } },
    { spawnImpl, observeImpl: async () => ({ targetAwake: true }) },
  );
  assert.equal(statusWins.probedVia, "statusCommand");
});

test("a microlink host wakes through the engine ladder with its secretRef resolved", async () => {
  const seen = [];
  const jobs = [];
  let clock = 1_000_000;
  const engine = createWakeEngine({
    runners: {
      http: async () => false,
      wol: async () => false,
      command: async () => false,
      microlink: async (transport, secret) => {
        seen.push({ type: transport.type, host: transport.host, secret });
        return true;
      },
    },
    resolveTokenRef: (ref) => (ref === "ref-wake" ? "aabbccddeeff0011" : null),
    probe: async () => {
      clock += 4_000;
      return seen.length > 0;
    },
    sleep: async () => {
      clock += WAKE_POLL_INTERVAL_MS;
    },
    now: () => clock,
    loadJobs: () => jobs.map((job) => structuredClone(job)),
    saveJobs: (next) => jobs.splice(0, jobs.length, ...next),
    log: () => {},
  });
  const started = await engine.startWake({
    id: "host-wake",
    name: "wake-box",
    wakeTransports: [{ type: "microlink", host: "wake.tailnet.net", secretRef: "ref-wake" }],
    createdAt: 0,
    updatedAt: 0,
  });
  assert.equal(started.accepted, true);
  for (let spin = 0; spin < 200 && jobs.at(-1)?.status !== "up"; spin++) {
    await new Promise((resolveTick) => setImmediate(resolveTick));
  }
  assert.deepEqual(seen, [{ type: "microlink", host: "wake.tailnet.net", secret: "aabbccddeeff0011" }]);
  const job = jobs.at(-1);
  assert.equal(job.status, "up");
  assert.equal(JSON.stringify(job).includes("aabbccddeeff0011"), false, "the job record never quotes the secret");
});

test("JSON-RPC framing: notifications get no reply, garbage gets a parse error", async () => {
  const tools = createPowerTools({ dir: tempState([]) });
  const handle = createMethodHandler(tools);
  assert.equal(await handleLine("", handle), null);
  assert.equal(await handleLine(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), handle), null);
  const reply = JSON.parse(await handleLine("{{{", handle));
  assert.equal(reply.error.code, -32700);
  const unknownMethod = JSON.parse(
    await handleLine(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "prompts/list" }), handle),
  );
  assert.equal(unknownMethod.id, 7);
  assert.equal(unknownMethod.error.code, -32601);
});

test("raw stdio: newline-delimited JSON initialize handshake", async () => {
  const dir = tempState([]);
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PASEO_REMOTE_POWER_STATE_DIR: dir },
    stdio: ["pipe", "pipe", "inherit"],
  });
  try {
    const lines = createInterface({ input: child.stdout });
    const reply = await new Promise((resolveReply, rejectReply) => {
      const guard = setTimeout(() => rejectReply(new Error("no initialize reply")), 5_000);
      lines.once("line", (line) => {
        clearTimeout(guard);
        resolveReply(JSON.parse(line));
      });
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n`,
      );
    });
    assert.equal(reply.id, 1);
    assert.equal(reply.result.protocolVersion, "2025-06-18");
    assert.equal(reply.result.serverInfo.name, SERVER_NAME);
    assert.equal(reply.result.serverInfo.version, SERVER_VERSION);
    assert.deepEqual(reply.result.capabilities, { tools: { listChanged: false } });
  } finally {
    child.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  }
});

test("over stdio: tools/list, power_status, idempotent wake, and validation errors", async () => {
  // statusCommand exits 0, so the host is up: status says up and the wake is
  // idempotently skipped — the full contract, hermetically, over real stdio.
  const dir = tempState([
    {
      ...hermeticHost(),
      statusCommand: { command: process.execPath, args: ["-e", "process.exit(0)"] },
    },
  ]);
  const session = await startClient(dir);
  try {
    const tools = await session.client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ["power_job_status", "power_status", "power_wake"]);

    const status = await callTool(session.client, "power_status", {});
    assert.equal(status.isError, undefined);
    const payload = JSON.parse(status.content[0].text);
    assert.equal(payload.hosts.length, 1);
    assert.equal(payload.hosts[0].id, "host-buildbox");
    assert.equal(payload.hosts[0].state, "up");
    assert.equal(payload.hosts[0].probedVia, "statusCommand");
    assert.deepEqual(payload.jobs, []);

    const targeted = await callTool(session.client, "power_status", { hostId: "host-buildbox" });
    assert.equal(JSON.parse(targeted.content[0].text).hosts[0].name, "build-box");

    const wake = await callTool(session.client, "power_wake", { hostId: "host-buildbox" });
    assert.equal(wake.isError, undefined);
    const started = JSON.parse(wake.content[0].text);
    assert.equal(started.accepted, false, "an up host starts no job");
    assert.equal(started.alreadyUp, true);
    assert.equal(started.jobId, null);
    assert.equal(started.status, "up");

    const unknown = await callTool(session.client, "power_status", { hostId: "host-nope" });
    assert.equal(unknown.isError, true);
    assert.match(unknown.content[0].text, /unknown host 'host-nope'/);

    const badArgs = await callTool(session.client, "power_wake", { wrong: "arg" });
    assert.equal(badArgs.isError, true);
    assert.match(badArgs.content[0].text, /unknown argument 'wrong'/);

    const missing = await callTool(session.client, "power_wake", {});
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /'hostId' must be a string/);

    const unknownJob = await callTool(session.client, "power_job_status", { jobId: "job-nope" });
    assert.equal(unknownJob.isError, true);
    assert.match(unknownJob.content[0].text, /unknown job/);
  } finally {
    await stopClient(session);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("power tools: wake runs the transport ladder and the job lands on disk", async () => {
  const dir = tempState([hermeticHost()]);
  const jobs = [];
  let clock = 1_000_000;
  const probeAnswers = [false, true];
  const engine = createWakeEngine({
    probe: async () => {
      clock += 4_000;
      return probeAnswers.shift() ?? false;
    },
    sleep: async () => {
      clock += WAKE_POLL_INTERVAL_MS;
    },
    now: () => clock,
    loadJobs: () => jobs.map((job) => structuredClone(job)),
    saveJobs: (next) => {
      jobs.splice(0, jobs.length, ...next);
      // Mirror to the real jobs.json: that file is the shared coordination
      // point the plugin server reads from its own process.
      saveJobs(next, dir);
    },
  });
  // The command transport is REAL: `node -e process.exit(0)` exits zero, so a
  // success here is the whole pipeline — spawn, exit code, verify, persist.
  const tools = createPowerTools({ dir, engine });
  const handleMethod = createMethodHandler(tools);

  const wake = JSON.parse(
    await handleLine(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "power_wake", arguments: { hostId: "host-buildbox" } } }), handleMethod),
  );
  assert.equal(wake.error, undefined);
  const result = JSON.parse(wake.result.content[0].text);
  assert.equal(result.accepted, true);
  assert.match(result.jobId, /^job-/);
  assert.equal(result.alreadyUp, false);

  const job = await settleJob(engine, result.jobId);
  assert.ok(job, "the job must reach a terminal state");
  assert.equal(job.status, "up");
  assert.ok(job.log.some((line) => line.includes("command accepted")));
  assert.ok(job.log.some((line) => line.includes("host reachable after")));

  const tracked = JSON.parse(
    await handleLine(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "power_job_status", arguments: { jobId: result.jobId } } }), handleMethod),
  );
  assert.equal(JSON.parse(tracked.result.content[0].text).job.status, "up");

  // jobs.json is the shared coordination point: the plugin server (another
  // process) reads exactly this file.
  const persisted = JSON.parse(readFileSync(join(dir, "jobs.json"), "utf8"));
  assert.ok(persisted.jobs.some((entry) => entry.jobId === result.jobId));
  assert.ok(TRANSPORT_TIMEOUT_MS > 0);

  rmSync(dir, { recursive: true, force: true });
});

test("server identity is the plugin's", () => {
  assert.equal(SERVER_NAME, "paseo-remote-power");
  assert.equal(SERVER_VERSION, "0.1.0");
});
