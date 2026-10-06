import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hostStatusRpc,
  hostWakeRpc,
  hostsAddRpc,
  hostsListRpc,
  hostsRemoveRpc,
  hostsUpdateRpc,
  jobStatusRpc,
  jobsListRpc,
  powerSettingsContract,
  HostRecordSchema,
  WakeTransportSchema,
  JOB_STATUSES,
  FAILURE_MODES,
  ACTIVE_JOB_STATUSES,
} from "./registry.ts";

/**
 * The RPC contracts are the plugin's API surface for both the roster UI and
 * the daemon: everything the client and the server exchange must parse. These
 * tests pin the schema shapes — the discriminated transport union, the write-
 * only token field, and the settings defaults.
 */

const VALID_TRANSPORT = { type: "http", url: "http://192.0.2.10/wake" };
const VALID_HOST_INPUT = {
  name: "build-box",
  wakeTransports: [VALID_TRANSPORT],
};

test("every contract is named and carries schemas", () => {
  for (const contract of [hostsListRpc, hostsAddRpc, hostsUpdateRpc, hostsRemoveRpc, hostStatusRpc, hostWakeRpc, jobStatusRpc, jobsListRpc]) {
    assert.match(contract.name, /^[a-z][a-z0-9._-]*$/);
    assert.ok(contract.input, `${contract.name} needs an input schema`);
    assert.ok(contract.output, `${contract.name} needs an output schema`);
  }
});

test("hosts.add accepts a minimal host and rejects an empty name", () => {
  const parsed = hostsAddRpc.input.parse(VALID_HOST_INPUT);
  assert.equal(parsed.name, "build-box");
  assert.equal(parsed.wakeTransports.length, 1);
  assert.equal(hostsAddRpc.input.safeParse({ name: "", wakeTransports: [] }).success, false);
  assert.equal(hostsAddRpc.input.safeParse({ name: "x" }).success, false, "wakeTransports is required");
});

test("the transport union discriminates on type and validates each shape", () => {
  assert.equal(WakeTransportSchema.parse({ type: "wol", mac: "00:11:22:33:44:55" }).type, "wol");
  assert.equal(WakeTransportSchema.parse({ type: "wol", mac: "00-11-22-33-44-55", host: "192.0.2.255" }).type, "wol");
  assert.equal(WakeTransportSchema.parse({ type: "command", command: "/usr/local/bin/wake", args: ["--port", "9"] }).type, "command");

  for (const bad of [
    { type: "carrier-pigeon" },
    { type: "wol", mac: "nope" },
    { type: "http" },
    { type: "command" },
  ]) {
    assert.equal(WakeTransportSchema.safeParse(bad).success, false, `${JSON.stringify(bad)} must not parse`);
  }
});

test("host records round-trip through the schema", () => {
  const now = Date.now();
  const record = HostRecordSchema.parse({
    id: "host-abcd1234",
    name: "build-box",
    sshTarget: "build.example.net",
    wakeWindowSeconds: 110,
    wakeTransports: [{ type: "wol", mac: "00:11:22:33:44:55" }, VALID_TRANSPORT],
    createdAt: now,
    updatedAt: now,
  });
  assert.equal(record.wakeTransports.length, 2);
  assert.equal(HostRecordSchema.safeParse({ ...record, wakeWindowSeconds: 3 }).success, false);
  assert.equal(HostRecordSchema.safeParse({ ...record, wakeTransports: [] }).success, true, "a host may exist with no transports");
});

test("host.status output vocabulary is up/down/unknown", () => {
  const output = hostStatusRpc.output.parse({ id: "host-abcd1234", state: "up", probedVia: "ssh", error: null, checkedAt: 1 });
  assert.equal(output.state, "up");
  assert.equal(hostStatusRpc.output.safeParse({ id: "x", state: "woo", probedVia: "ssh", error: null, checkedAt: 1 }).success, false);
});

test("host.wake output carries the job state machine and failure modes", () => {
  for (const status of JOB_STATUSES) {
    const parsed = hostWakeRpc.output.parse({ accepted: true, jobId: "job-1", status, alreadyUp: false, error: null });
    assert.equal(parsed.status, status);
  }
  const failed = hostWakeRpc.output.parse({
    accepted: false,
    jobId: null,
    status: "failed",
    alreadyUp: false,
    error: { mode: "never-reachable", message: "burst accepted, host never came up within 110s" },
  });
  assert.equal(failed.error?.mode, "never-reachable");
  assert.equal(hostWakeRpc.output.safeParse({ accepted: true, jobId: null, status: "flap", alreadyUp: false, error: null }).success, false);
  for (const mode of FAILURE_MODES) {
    assert.ok(FAILURE_MODES.includes(mode));
  }
});

test("active job statuses are exactly the in-flight ones", () => {
  assert.deepEqual([...ACTIVE_JOB_STATUSES], ["starting", "waking", "verifying"]);
  for (const status of ACTIVE_JOB_STATUSES) {
    assert.ok(JOB_STATUSES.includes(status));
  }
});

test("jobs.list and job.status share the job record schema", () => {
  const job = {
    jobId: "job-1",
    hostId: "host-1",
    status: "verifying",
    startedAt: 1,
    endedAt: null,
    error: null,
    log: ["wake requested for 'box'"],
  };
  assert.equal(jobStatusRpc.output.parse({ job })?.job?.status, "verifying");
  assert.equal(jobStatusRpc.output.parse({ job: null }).job, null);
  assert.equal(jobsListRpc.output.parse({ jobs: [job] }).jobs.length, 1);
  assert.equal(
    jobsListRpc.output.safeParse({ jobs: [{ ...job, status: "haunting" }] }).success,
    false,
  );
});

test("settings defaults mirror the generalized wake script", () => {
  const settings = powerSettingsContract.schema.parse({});
  assert.equal(settings.defaultWakeWindowSeconds, 110);
  assert.equal(settings.probeTimeoutSeconds, 8);
  assert.equal(settings.maxConcurrentWakes, 2);
  assert.equal(settings.agentInjectionEnabled, true);
  assert.equal(powerSettingsContract.get.name, "paseo-remote-power.settings.get");
  assert.equal(powerSettingsContract.update.name, "paseo-remote-power.settings.update");
  assert.equal(powerSettingsContract.reset.name, "paseo-remote-power.settings.reset");
  // Partial updates accept a lone field.
  assert.equal(powerSettingsContract.update.input.parse({ maxConcurrentWakes: 3 }).maxConcurrentWakes, 3);
});

test("settings clamps are part of the schema", () => {
  assert.equal(powerSettingsContract.schema.safeParse({ defaultWakeWindowSeconds: 3 }).success, false);
  assert.equal(powerSettingsContract.schema.safeParse({ probeTimeoutSeconds: 999 }).success, false);
});
