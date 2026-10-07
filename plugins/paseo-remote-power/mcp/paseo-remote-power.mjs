#!/usr/bin/env node
// paseo-remote-power: embedded MCP server for wake/status control of remote
// machines (homelab boxes, GPU workstations) from the Paseo daemon.
//
// Tools:
//   power_status(hostId?)     per-host up/down/unknown + in-flight wake jobs
//   power_wake(hostId)        start an async wake; returns { jobId, status }
//   power_job_status(jobId)   one wake job's state machine + log
//
// State is shared with the plugin server through the SAME state dir the
// PluginStorage-backed stores use (~/.paseo/plugin-data/xpufx/paseo-remote-power/):
//   hosts.json   the hosts registry (token refs, never secrets)
//   tokens.json  bearer tokens keyed by ref
//   jobs.json    wake job history (the coordination point between processes)
// Override the directory with PASEO_REMOTE_POWER_STATE_DIR (tests, odd layouts).
//
// This file is deliberately dependency-free (node builtins only): the plugin
// copies it to a stable state-dir path and injects it into every new agent,
// and a bare stable path cannot resolve a node_modules tree. Input validation
// mirrors the zod schemas in shared/registry.ts field for field, and
// mcp/test/protocol.test.mjs pins that mirror so the two cannot drift.
// Running as main starts the stdio loop; importing (tests) does not.
import { createInterface } from "node:readline";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { createSocket } from "node:dgram";
import { randomUUID, createHash, createHmac, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

export const SERVER_NAME = "paseo-remote-power";
export const SERVER_VERSION = "0.1.0";
export const PROTOCOL_VERSION = "2025-06-18";

// Shared vocabulary and constants — must stay identical to the plugin server's
// engine (server/wake-engine.ts); the parity test pins every one of these.
export const WAKE_POLL_INTERVAL_MS = 3_000;
export const DEFAULT_WAKE_WINDOW_SECONDS = 110;
export const TRANSPORT_TIMEOUT_MS = 30_000;
export const DEFAULT_PROBE_TIMEOUT_SECONDS = 8;
export const DEFAULT_MAX_CONCURRENT_WAKES = 2;
export const MICROLINK_DEFAULT_PORT = 48320;
export const MICROLINK_UDP_REPLY_TIMEOUT_MS = 6_000;
export const MICROLINK_OBSERVER_TIMEOUT_MS = 6_000;
export const MICROLINK_TRANSPORT_TIMEOUT_MS = 30_000;
export const JOB_STATUSES = ["starting", "waking", "verifying", "up", "failed"];
export const ACTIVE_JOB_STATUSES = ["starting", "waking", "verifying"];
export const FAILURE_MODES = ["no-transport", "never-reachable", "saturated", "unknown-host"];
export const HOST_STATES = ["up", "down", "unknown"];

// ---------------------------------------------------------------------------
// Validation — mirrors shared/registry.ts (zod) field for field.
// ---------------------------------------------------------------------------

export function validateMac(mac) {
  return typeof mac === "string" && /^[0-9a-fA-F]{2}([:-][0-9a-fA-F]{2}){5}$/.test(mac);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value, max) {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

/** Wake transport: {type:"http",url,tokenRef?} | {type:"wol",mac,host?} | {type:"command",command,args?} | {type:"microlink",host,mode?,secretRef?,port?}. */
export function validateWakeTransport(transport) {
  if (!isPlainObject(transport)) return "transport must be an object";
  switch (transport.type) {
    case "http":
      if (!optionalString(transport.url, 2048)) return "http transport needs a url";
      if (transport.tokenRef !== undefined && !optionalString(transport.tokenRef, 128)) return "tokenRef must be a short string";
      return null;
    case "wol":
      if (!validateMac(transport.mac)) return "wol transport needs a MAC like 00:11:22:33:44:55";
      if (transport.host !== undefined && !optionalString(transport.host, 253)) return "wol host must be a short string";
      return null;
    case "command":
      if (!optionalString(transport.command, 1024)) return "command transport needs a command";
      if (transport.args !== undefined) {
        if (!Array.isArray(transport.args) || transport.args.length > 64) return "args must be an array of at most 64 strings";
        for (const arg of transport.args) {
          if (!optionalString(arg, 1024)) return "args must be an array of at most 64 strings";
        }
      }
      return null;
    case "microlink":
      if (!optionalString(transport.host, 253)) return "microlink transport needs a host";
      if (transport.mode !== undefined && transport.mode !== "http" && transport.mode !== "udp") {
        return "microlink mode must be http or udp";
      }
      if (transport.secretRef !== undefined && !optionalString(transport.secretRef, 128)) return "secretRef must be a short string";
      if (
        transport.port !== undefined &&
        (!Number.isInteger(transport.port) || transport.port < 1 || transport.port > 65535)
      ) {
        return "microlink port must be an integer between 1 and 65535";
      }
      return null;
    default:
      return "transport type must be http, wol, command, or microlink";
  }
}

export function validateHostRecord(record) {
  if (!isPlainObject(record)) return "host must be an object";
  if (!optionalString(record.id, 64)) return "host needs an id";
  if (!optionalString(record.name, 64)) return "host needs a name";
  if (record.sshTarget !== undefined && !optionalString(record.sshTarget, 253)) return "sshTarget must be a short string";
  if (record.wakeWindowSeconds !== undefined) {
    if (!Number.isInteger(record.wakeWindowSeconds) || record.wakeWindowSeconds < 10 || record.wakeWindowSeconds > 3600) {
      return "wakeWindowSeconds must be an integer between 10 and 3600";
    }
  }
  if (record.statusCommand !== undefined) {
    const status = record.statusCommand;
    if (!isPlainObject(status) || !optionalString(status.command, 1024)) return "statusCommand needs a command";
    if (status.args !== undefined && !Array.isArray(status.args)) return "statusCommand args must be an array";
  }
  if (!Array.isArray(record.wakeTransports) || record.wakeTransports.length > 8) {
    return "wakeTransports must be an array of at most 8 transports";
  }
  for (const transport of record.wakeTransports) {
    const issue = validateWakeTransport(transport);
    if (issue) return issue;
  }
  return null;
}

// ---------------------------------------------------------------------------
// State dir — same layout as the helper's PluginStorage default namespace.
// ---------------------------------------------------------------------------

export function stateDir() {
  return process.env.PASEO_REMOTE_POWER_STATE_DIR || join(homedir(), ".paseo", "plugin-data", "xpufx", "paseo-remote-power");
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFileAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const staging = join(tmpdir(), `paseo-remote-power-${randomUUID()}.json`);
  writeFileSync(staging, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(staging, file);
}

export function loadHosts(dir = stateDir()) {
  const parsed = readJsonFile(join(dir, "hosts.json"), { hosts: [] });
  return Array.isArray(parsed?.hosts) ? parsed.hosts : [];
}

export function loadTokens(dir = stateDir()) {
  const parsed = readJsonFile(join(dir, "tokens.json"), {});
  if (!isPlainObject(parsed)) return {};
  const tokens = {};
  for (const [ref, secret] of Object.entries(parsed)) {
    if (typeof secret === "string") tokens[ref] = secret;
  }
  return tokens;
}

export function loadJobs(dir = stateDir()) {
  const parsed = readJsonFile(join(dir, "jobs.json"), { jobs: [] });
  return Array.isArray(parsed?.jobs) ? parsed.jobs : [];
}

export function saveJobs(jobs, dir = stateDir()) {
  writeJsonFileAtomic(join(dir, "jobs.json"), { jobs });
}

// ---------------------------------------------------------------------------
// WoL magic packet: 6 × 0xFF, then the MAC sixteen times (102 bytes).
// ---------------------------------------------------------------------------

export const MAGIC_PACKET_LENGTH = 6 + 16 * 6;
export const DEFAULT_WOL_PORT = 9;
export const DEFAULT_WOL_BROADCAST = "255.255.255.255";

export function parseMacAddress(mac) {
  const hex = String(mac).replace(/[:.-]/g, "");
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

export function buildMagicPacket(mac) {
  const address = parseMacAddress(mac);
  if (!address) return null;
  const packet = Buffer.alloc(MAGIC_PACKET_LENGTH, 0xff);
  for (let repeat = 0; repeat < 16; repeat++) {
    address.copy(packet, 6 + repeat * 6);
  }
  return packet;
}

export function sendMagicPacket(transport, options = {}) {
  const packet = buildMagicPacket(transport.mac);
  if (!packet) return Promise.resolve(false);
  const port = options.port ?? DEFAULT_WOL_PORT;
  const address = transport.host ?? options.host ?? DEFAULT_WOL_BROADCAST;
  return new Promise((resolveSend) => {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    const finish = (sent) => {
      try {
        socket.close();
      } catch {
        // already closed
      }
      resolveSend(sent);
    };
    socket.on("error", () => finish(false));
    socket.bind(() => {
      try {
        socket.setBroadcast(true);
      } catch {
        // best effort
      }
      socket.send(packet, port, address, (cause) => finish(!cause));
    });
  });
}

// ---------------------------------------------------------------------------
// Microlink: the deployed Cyril wake-authority wire protocol (ESP32-S3),
// mirrored byte-for-byte from server/microlink.ts.
//
//   transcript  = `POST\n/v1/wake\n<unix-seconds>\n<nonce-32hex>\n<sha256hex-of-body>`
//   signature   = HMAC-SHA256(secret, transcript) hex   (secret = raw bytes from hex)
//   auth header = `Cyril-HMAC <signature>`
//
// HTTP wake: POST with the four X-Cyril-*/Authorization headers; 2xx accepted.
// UDP wake: one datagram `POST /v1/wake\n<ts>\n<nonce>\n<digest>\nCyril-HMAC <sig>`;
// the one-line JSON reply's `accepted` decides. Observer (unsigned): GET
// /v1/observer → JSON with `target_awake`. The hex secret comes from
// tokens.json via secretRef and never appears in a log, error, or RPC output.
// ---------------------------------------------------------------------------

export function signWake(secretHex, method = "POST", target = "/v1/wake", body = "", options = {}) {
  const ts = String(Math.floor((options.now ?? (() => Date.now() / 1000))()));
  const nonce = (options.nonce ?? (() => randomBytes(16).toString("hex")))();
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  const transcript = `${method}\n${target}\n${ts}\n${nonce}\n${digest}`;
  const signature = createHmac("sha256", Buffer.from(secretHex, "hex")).update(transcript, "utf8").digest("hex");
  return { ts, nonce, digest, authorization: `Cyril-HMAC ${signature}` };
}

/** The wire datagram: `POST /v1/wake\n<ts>\n<nonce>\n<digest>\nCyril-HMAC <sig>`. */
export function buildWakeDatagram(signature) {
  return `POST /v1/wake\n${signature.ts}\n${signature.nonce}\n${signature.digest}\n${signature.authorization}`;
}

/** `accepted` from the reply line: real JSON first, then a tolerant text scan. */
export function replyAccepted(reply) {
  if (reply === null) return false;
  const text = reply.toString("utf8");
  try {
    const parsed = JSON.parse(text);
    if (isPlainObject(parsed) && parsed.accepted === true) return true;
  } catch {
    // Not JSON — the firmware may append a newline or log noise; scan the text.
  }
  return /"accepted"\s*:\s*true/.test(text);
}

/** Minimal UDP surface mirroring server/microlink.ts's MicrolinkSocket. */
export function createMicrolinkSocket() {
  const socket = createSocket({ type: "udp4", reuseAddr: true });
  let deliver = null;
  socket.on("message", (packet) => {
    const waiting = deliver;
    deliver = null;
    if (waiting) waiting(packet);
  });
  // An ICMP unreachable surfaces as a socket 'error' event, not a send-callback
  // failure; drain a pending receive and never crash on the event.
  socket.on("error", () => {
    const waiting = deliver;
    deliver = null;
    if (waiting) waiting(Buffer.alloc(0));
  });
  socket.bind(() => {});
  return {
    send: (packet, port, address) =>
      new Promise((resolveSend, rejectSend) => {
        socket.send(packet, port, address, (cause) => (cause ? rejectSend(cause) : resolveSend()));
      }),
    receive: (timeoutMs) =>
      new Promise((resolveReceive) => {
        const guard = setTimeout(() => {
          deliver = null;
          resolveReceive(null);
        }, timeoutMs);
        deliver = (packet) => {
          clearTimeout(guard);
          resolveReceive(packet);
        };
      }),
    close: () => {
      try {
        socket.close();
      } catch {
        // already closed
      }
    },
  };
}

/** Signed HTTP wake. True iff the authority answered 2xx. Never throws. */
export async function sendWakeHttp(host, port, secretHex, options = {}) {
  const { ts, nonce, digest, authorization } = signWake(secretHex, "POST", "/v1/wake", "", options);
  try {
    const response = await (options.fetchImpl ?? fetch)(`http://${host}:${port}/v1/wake`, {
      method: "POST",
      headers: {
        "X-Cyril-Timestamp": ts,
        "X-Cyril-Nonce": nonce,
        "X-Cyril-Content-SHA256": digest,
        Authorization: authorization,
      },
      signal: AbortSignal.timeout(MICROLINK_TRANSPORT_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Signed UDP wake: one datagram, one reply line. Never throws. */
export async function sendWakeUdp(host, port, secretHex, options = {}) {
  try {
    const datagram = buildWakeDatagram(signWake(secretHex, "POST", "/v1/wake", "", options));
    const socket = (options.socketFactory ?? createMicrolinkSocket)();
    try {
      await socket.send(Buffer.from(datagram, "utf8"), port, host);
      const reply = await socket.receive(options.replyTimeoutMs ?? MICROLINK_UDP_REPLY_TIMEOUT_MS);
      return replyAccepted(reply);
    } finally {
      socket.close();
    }
  } catch {
    return false;
  }
}

/** Unsigned observer read. Null means "no answer": fetch failure, non-2xx, or unparseable body. */
export async function observeHttp(host, port, options = {}) {
  try {
    const response = await (options.fetchImpl ?? fetch)(`http://${host}:${port}/v1/observer`, {
      method: "GET",
      signal: AbortSignal.timeout(options.timeoutMs ?? MICROLINK_OBSERVER_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = await response.json();
    if (!isPlainObject(parsed) || typeof parsed.target_awake !== "boolean") return null;
    return { targetAwake: parsed.target_awake };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reachability probe: custom status command wins over ssh BatchMode/ConnectTimeout.
// ---------------------------------------------------------------------------

export function makeSpawnFn() {
  return (command, args, timeoutMs) =>
    new Promise((resolveSpawn) => {
      const child = spawn(command, args, { timeout: timeoutMs, stdio: "ignore" });
      child.on("exit", (code) => resolveSpawn({ code }));
      child.on("error", () => resolveSpawn({ code: null }));
    });
}

export async function probeHost(host, options = {}) {
  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_PROBE_TIMEOUT_SECONDS;
  const spawnImpl = options.spawnImpl ?? makeSpawnFn();
  const observeImpl = options.observeImpl ?? null;
  const timeoutMs = timeoutSeconds * 1000 + 2_000;
  const run = async (command, args) => (await spawnImpl(command, args, timeoutMs)).code === 0;
  if (host.statusCommand) {
    const up = await run(host.statusCommand.command, host.statusCommand.args ?? []);
    return { state: up ? "up" : "down", probedVia: "statusCommand" };
  }
  // A microlink host's observer is the fast, unsigned channel: the device's
  // own word on `target_awake`, so an answer is authoritative (up iff true).
  // No answer at all (unreachable, non-2xx, malformed) falls through to ssh.
  const microlink = host.wakeTransports?.find((transport) => transport.type === "microlink");
  if (microlink) {
    const observe =
      observeImpl ??
      ((obsHost, obsPort) => observeHttp(obsHost, obsPort, { timeoutMs: timeoutSeconds * 1000 }));
    try {
      const report = await observe(microlink.host, microlink.port ?? MICROLINK_DEFAULT_PORT);
      if (report !== null) return { state: report.targetAwake ? "up" : "down", probedVia: "observer" };
    } catch {
      // Observer trouble is not a probe crash: fall through to the next channel.
    }
  }
  if (host.sshTarget) {
    const up = await run("ssh", ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${timeoutSeconds}`, host.sshTarget, "true"]);
    return { state: up ? "up" : "down", probedVia: "ssh" };
  }
  return { state: "unknown", probedVia: "none" };
}

// ---------------------------------------------------------------------------
// Wake engine — the same state machine as server/wake-engine.ts, writing the
// same jobs.json so both processes see one job history.
// ---------------------------------------------------------------------------

export function describeTransport(transport) {
  switch (transport.type) {
    case "http":
      return redactUrlForLog(transport.url);
    case "wol":
      return transport.host !== undefined ? `${transport.mac} via ${transport.host}` : transport.mac;
    case "command":
      return [transport.command, ...(transport.args ?? [])].join(" ");
    case "microlink":
      return `microlink(${transport.host}:${transport.port ?? MICROLINK_DEFAULT_PORT} ${transport.mode ?? "http"})`;
    default:
      return "unknown transport";
  }
}

export function redactUrlForLog(url) {
  try {
    const parsed = new URL(url);
    return parsed.username === "" && parsed.password === ""
      ? parsed.toString()
      : `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url.replace(/\/\/[^@/]+@/, "//");
  }
}

const defaultRunners = {
  async http(transport, token) {
    try {
      const response = await fetch(transport.url, {
        method: "POST",
        ...(token !== null ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        signal: AbortSignal.timeout(TRANSPORT_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  },
  wol(transport) {
    return sendMagicPacket(transport);
  },
  async command(transport) {
    const runner = makeSpawnFn();
    const result = await runner(transport.command, transport.args ?? [], TRANSPORT_TIMEOUT_MS);
    return result.code === 0;
  },
  async microlink(transport, secret) {
    if (secret === null) return false;
    const port = transport.port ?? MICROLINK_DEFAULT_PORT;
    // sendWakeHttp/sendWakeUdp never throw; mode defaults to http.
    return transport.mode === "udp" ? sendWakeUdp(transport.host, port, secret) : sendWakeHttp(transport.host, port, secret);
  },
};

export function createWakeEngine(deps = {}) {
  const settings = () =>
    deps.settings ?? {
      defaultWakeWindowSeconds: DEFAULT_WAKE_WINDOW_SECONDS,
      probeTimeoutSeconds: DEFAULT_PROBE_TIMEOUT_SECONDS,
      maxConcurrentWakes: DEFAULT_MAX_CONCURRENT_WAKES,
    };
  const runners = { ...defaultRunners, ...deps.runners };
  const resolveTokenRef = deps.resolveTokenRef ?? ((ref) => loadTokens()[ref] ?? null);
  const probe =
    deps.probe ?? (async (host) => (await probeHost(host, { timeoutSeconds: settings().probeTimeoutSeconds })).state === "up");
  const sleep = deps.sleep ?? ((ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)));
  const now = deps.now ?? (() => Date.now());
  const load = deps.loadJobs ?? (() => loadJobs());
  const save = deps.saveJobs ?? ((jobs) => saveJobs(jobs));
  const log = deps.log ?? (() => {});

  function withTransition(jobId, mutate) {
    const jobs = load();
    const index = jobs.findIndex((entry) => entry.jobId === jobId);
    if (index === -1) return;
    const next = [...jobs];
    next[index] = mutate(jobs[index]);
    save(next);
  }

  async function runJob(host, jobId) {
    const job = load().find((entry) => entry.jobId === jobId);
    if (!job) return;
    const startedAt = job.startedAt;
    const windowSeconds = host.wakeWindowSeconds ?? settings().defaultWakeWindowSeconds;
    withTransition(jobId, (entry) => ({
      ...entry,
      status: "waking",
      log: [...entry.log, `waking '${host.name}' via ${host.wakeTransports.length} transport(s)`],
    }));

    let acceptedBy = null;
    for (const transport of host.wakeTransports) {
      const label = describeTransport(transport);
      log(`host '${host.id}': trying ${transport.type} wake (${label})`);
      withTransition(jobId, (entry) => ({ ...entry, log: [...entry.log, `trying ${transport.type} (${label})`] }));
      let ok = false;
      try {
        const token =
          transport.type === "http"
            ? resolveTokenRef(transport.tokenRef ?? "")
            : transport.type === "microlink"
              ? resolveTokenRef(transport.secretRef ?? "")
              : null;
        ok = await runners[transport.type](transport, token);
      } catch (cause) {
        log(`host '${host.id}': ${transport.type} wake threw: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      if (ok) {
        acceptedBy = transport.type;
        withTransition(jobId, (entry) => ({ ...entry, status: "verifying", log: [...entry.log, `${transport.type} accepted`] }));
        break;
      }
      withTransition(jobId, (entry) => ({ ...entry, log: [...entry.log, `${transport.type} failed`] }));
    }

    if (acceptedBy === null) {
      log(`host '${host.id}': wake failed — no usable wake transport`);
      withTransition(jobId, (entry) => ({
        ...entry,
        status: "failed",
        endedAt: now(),
        error: { mode: "no-transport", message: "no usable wake transport" },
        log: [...entry.log, "wake failed — no usable wake transport"],
      }));
      return;
    }

    const deadline = startedAt + windowSeconds * 1000;
    withTransition(jobId, (entry) => ({ ...entry, log: [...entry.log, `verifying reachability (window ${windowSeconds}s)`] }));
    for (;;) {
      const remaining = deadline - now();
      if (remaining <= 0) break;
      await sleep(Math.min(WAKE_POLL_INTERVAL_MS, remaining));
      if (await probe(host)) {
        const elapsed = Math.round((now() - startedAt) / 1000);
        withTransition(jobId, (entry) => ({
          ...entry,
          status: "up",
          endedAt: now(),
          log: [...entry.log, `host reachable after ${elapsed}s`],
        }));
        return;
      }
    }
    if (await probe(host)) {
      withTransition(jobId, (entry) => ({ ...entry, status: "up", endedAt: now(), log: [...entry.log, "host reachable"] }));
      return;
    }
    log(`host '${host.id}': wake failed — accepted via ${acceptedBy} but the host never became reachable`);
    withTransition(jobId, (entry) => ({
      ...entry,
      status: "failed",
      endedAt: now(),
      error: {
        mode: "never-reachable",
        message: `wake accepted via ${acceptedBy} but the host never became reachable within ${windowSeconds}s`,
      },
      log: [...entry.log, `wake failed — burst accepted, host never came up within ${windowSeconds}s`],
    }));
  }

  return {
    async startWake(host) {
      const jobs = load();
      const existing = jobs.find((entry) => entry.hostId === host.id && ACTIVE_JOB_STATUSES.includes(entry.status));
      if (existing) {
        return { accepted: false, jobId: existing.jobId, status: existing.status, alreadyUp: false, error: null };
      }
      // Idempotence outranks the concurrency cap: an up host needs no wake.
      if (await probe(host)) {
        return { accepted: false, jobId: null, status: "up", alreadyUp: true, error: null };
      }
      const limits = settings();
      const active = jobs.filter((entry) => ACTIVE_JOB_STATUSES.includes(entry.status)).length;
      if (active >= limits.maxConcurrentWakes) {
        return {
          accepted: false,
          jobId: null,
          status: "failed",
          alreadyUp: false,
          error: {
            mode: "saturated",
            message: `${active} wake job(s) already running (max ${limits.maxConcurrentWakes}) — try again when one finishes`,
          },
        };
      }
      const job = {
        jobId: `job-${randomUUID().slice(0, 8)}`,
        hostId: host.id,
        status: "starting",
        startedAt: now(),
        endedAt: null,
        error: null,
        log: [`wake requested for '${host.name}'`],
      };
      save([...jobs, job]);
      log(`host '${host.id}': wake job ${job.jobId} started`);
      void runJob(host, job.jobId).catch(() => {});
      return { accepted: true, jobId: job.jobId, status: job.status, alreadyUp: false, error: null };
    },
    job(jobId) {
      return load().find((entry) => entry.jobId === jobId) ?? null;
    },
    jobs() {
      return load();
    },
  };
}

// ---------------------------------------------------------------------------
// Tool layer
// ---------------------------------------------------------------------------

export const TOOL_SCHEMAS = {
  powerStatus: {
    type: "object",
    properties: {
      hostId: { type: "string", description: "Optional host id. Omit to probe every configured host." },
    },
    additionalProperties: false,
  },
  powerWake: {
    type: "object",
    properties: {
      hostId: { type: "string", description: "Id of the host to wake (see power_status)." },
    },
    required: ["hostId"],
    additionalProperties: false,
  },
  powerJobStatus: {
    type: "object",
    properties: {
      jobId: { type: "string", description: "Wake job id returned by power_wake." },
    },
    required: ["jobId"],
    additionalProperties: false,
  },
};

function validateToolArgs(schema, args) {
  if (args === undefined || args === null) args = {};
  if (!isPlainObject(args)) return { ok: false, error: "arguments must be an object" };
  for (const key of Object.keys(args)) {
    if (!(key in schema.properties)) return { ok: false, error: `unknown argument '${key}'` };
  }
  for (const required of schema.required ?? []) {
    const value = args[required];
    if (!optionalString(value, 4096)) return { ok: false, error: `'${required}' must be a string` };
  }
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (args[key] === undefined) continue;
    if (!optionalString(args[key], 4096)) return { ok: false, error: `'${key}' must be a string` };
  }
  return { ok: true, args };
}

/** Tool implementations over the shared state. Exported for tests. */
export function createPowerTools(deps = {}) {
  const dir = deps.dir ?? stateDir();
  const engine = deps.engine ?? createWakeEngine({
    ...(deps.engineDeps ?? {}),
    // When the caller pins a state dir without supplying an engine, bind the
    // engine's job store to the same dir so tools and engine stay coherent.
    ...(deps.engineDeps?.loadJobs
      ? {}
      : { loadJobs: () => loadJobs(dir), saveJobs: (jobs) => saveJobs(jobs, dir) }),
  });
  const probeWithOptions = async (host) =>
    probeHost(host, { timeoutSeconds: deps.probeTimeoutSeconds ?? DEFAULT_PROBE_TIMEOUT_SECONDS });

  return {
    async power_status(args) {
      const check = validateToolArgs(TOOL_SCHEMAS.powerStatus, args);
      if (!check.ok) throw new Error(check.error);
      const hosts = loadHosts(dir);
      const wanted = check.args.hostId;
      const targets = wanted !== undefined ? hosts.filter((host) => host.id === wanted) : hosts;
      if (wanted !== undefined && targets.length === 0) {
        throw new Error(`unknown host '${wanted}'`);
      }
      const statuses = await Promise.all(
        targets.map(async (host) => {
          try {
            const { state, probedVia } = await probeWithOptions(host);
            return { id: host.id, name: host.name, state, probedVia };
          } catch (cause) {
            return {
              id: host.id,
              name: host.name,
              state: "unknown",
              error: cause instanceof Error ? cause.message : String(cause),
            };
          }
        }),
      );
      const jobs = engine
        .jobs()
        .filter((job) => ACTIVE_JOB_STATUSES.includes(job.status))
        .map((job) => ({ jobId: job.jobId, hostId: job.hostId, status: job.status, startedAt: job.startedAt }));
      return { hosts: statuses, jobs };
    },

    async power_wake(args) {
      const check = validateToolArgs(TOOL_SCHEMAS.powerWake, args);
      if (!check.ok) throw new Error(check.error);
      const host = loadHosts(dir).find((entry) => entry.id === check.args.hostId);
      if (!host) throw new Error(`unknown host '${check.args.hostId}'`);
      const outcome = await engine.startWake(host);
      return { jobId: outcome.jobId, status: outcome.status, accepted: outcome.accepted, alreadyUp: outcome.alreadyUp, error: outcome.error };
    },

    async power_job_status(args) {
      const check = validateToolArgs(TOOL_SCHEMAS.powerJobStatus, args);
      if (!check.ok) throw new Error(check.error);
      const job = engine.job(check.args.jobId);
      if (!job) throw new Error(`unknown job '${check.args.jobId}'`);
      return { job };
    },
  };
}

export const TOOL_DEFINITIONS = [
  {
    name: "power_status",
    title: "Power status",
    description:
      "Reachability of configured hosts (up/down/unknown; ssh BatchMode or a custom status command) plus any wake jobs in flight. Call this before running work on a remote machine.",
    inputSchema: TOOL_SCHEMAS.powerStatus,
  },
  {
    name: "power_wake",
    title: "Power wake",
    description:
      "Start waking a host (ordered transports: http POST, signed microlink to a Cyril wake authority, Wake-on-LAN, custom command; idempotent when already up) and return the wake job id immediately. Poll power_job_status until it reports up or failed.",
    inputSchema: TOOL_SCHEMAS.powerWake,
  },
  {
    name: "power_job_status",
    title: "Power job status",
    description: "One wake job's state (starting|waking|verifying|up|failed), failure mode, and log.",
    inputSchema: TOOL_SCHEMAS.powerJobStatus,
  },
];

/** JSON-RPC method dispatch over the tool layer. Exported for tests. */
export function createMethodHandler(tools) {
  return async function handleMethod(method, params) {
    switch (method) {
      case "initialize": {
        const requested = params && typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION;
        return {
          protocolVersion: requested,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        };
      }
      case "ping":
        return {};
      case "tools/list":
        return { tools: TOOL_DEFINITIONS };
      case "tools/call": {
        const name = params?.name;
        const tool = tools[name];
        if (typeof name !== "string" || !tool) {
          throw methodError(`unknown tool '${String(name)}'`);
        }
        try {
          const result = await tool(params?.arguments);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
        } catch (cause) {
          return {
            content: [{ type: "text", text: `error: ${cause instanceof Error ? cause.message : String(cause)}` }],
            isError: true,
          };
        }
      }
      default:
        throw methodError(`unknown method '${String(method)}'`);
    }
  };
}

function methodError(message) {
  const error = new Error(message);
  error.jsonRpcCode = -32601;
  return error;
}

/** One stdio JSON-RPC exchange (newline-delimited), export-sided for tests. */
export async function handleLine(line, handleMethod) {
  if (line.trim().length === 0) return null;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
  }
  if (!isPlainObject(message) || typeof message.method !== "string") return null;
  const isNotification = message.id === undefined || message.id === null;
  if (isNotification) return null;
  try {
    const result = await handleMethod(message.method, message.params);
    return JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
  } catch (cause) {
    const code = typeof cause?.jsonRpcCode === "number" ? cause.jsonRpcCode : -32603;
    return JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code, message: cause instanceof Error ? cause.message : String(cause) } });
  }
}

async function main() {
  const tools = createPowerTools();
  const handleMethod = createMethodHandler(tools);
  const lines = createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    void handleLine(line, handleMethod).then((reply) => {
      if (reply !== null) process.stdout.write(`${reply}\n`);
    });
  });
  await new Promise((resolveStdio) => {
    lines.on("close", resolveStdio);
  });
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  (() => {
    try {
      return import.meta.url === pathToFileURL(process.argv[1]).href;
    } catch {
      return false;
    }
  })();

if (invokedDirectly) {
  await main();
}
