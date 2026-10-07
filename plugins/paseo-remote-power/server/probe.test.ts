import { test } from "node:test";
import assert from "node:assert/strict";
import { probeHost, realSpawn, type ObserveFn, type SpawnFn } from "./probe.ts";
import type { HostRecord } from "../shared/registry.ts";

/**
 * Probes are the plugin's ground truth for "up": ssh BatchMode/ConnectTimeout,
 * or a custom status command whose exit code answers. The spawner is a seam,
 * so every channel is exercised over fake children with no network and no
 * real ssh.
 */

function host(overrides: Partial<HostRecord> = {}): HostRecord {
  return {
    id: "host-1",
    name: "box",
    wakeTransports: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

interface FakeSpawnCall {
  command: string;
  args: string[];
  timeoutMs: number;
}

interface FakeSpawn extends SpawnFn {
  calls: FakeSpawnCall[];
}

function fakeSpawn(codes: number[] | ((command: string, args: string[]) => number)): FakeSpawn {
  const isCallback = typeof codes === "function";
  const calls: FakeSpawnCall[] = [];
  const pick = (command: string, args: string[]): number =>
    isCallback ? codes(command, args) : (codes.shift() ?? 1);
  const spawnFn: SpawnFn = async (command, args, timeoutMs) => {
    calls.push({ command, args, timeoutMs });
    return { code: pick(command, args) };
  };
  return Object.assign(spawnFn, { calls });
}

/** An observer seam that answers from a script; records the host:port it was asked about. */
function fakeObserver(answers: ({ targetAwake: boolean } | null)[]): ObserveFn & { calls: { host: string; port: number }[] } {
  const calls: { host: string; port: number }[] = [];
  const observe: ObserveFn = async (obsHost, obsPort) => {
    calls.push({ host: obsHost, port: obsPort });
    return answers.shift() ?? null;
  };
  return Object.assign(observe, { calls });
}

test("ssh probe runs BatchMode with a bounded ConnectTimeout and a bare true", async () => {
  const spawnFn = fakeSpawn([0]);
  const result = await probeHost(host({ sshTarget: "build.example.net" }), { spawnImpl: spawnFn, timeoutSeconds: 8 });
  assert.equal(result.state, "up");
  assert.equal(result.probedVia, "ssh");
  assert.equal(spawnFn.calls.length, 1);
  const { command, args, timeoutMs } = spawnFn.calls[0];
  assert.equal(command, "ssh");
  assert.deepEqual(args, ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "build.example.net", "true"]);
  assert.ok(timeoutMs > 8_000, "the process grace must exceed the ConnectTimeout");
});

test("a nonzero ssh exit means down, and a crashing spawn is not an up", async () => {
  assert.equal((await probeHost(host({ sshTarget: "box" }), { spawnImpl: fakeSpawn([1]), timeoutSeconds: 2 })).state, "down");
  const crashSpawn: SpawnFn = async () => {
    throw new Error("simulated spawn failure");
  };
  assert.equal((await probeHost(host({ sshTarget: "box" }), { spawnImpl: crashSpawn, timeoutSeconds: 2 })).state, "down");
});

test("a custom status command wins over ssh and answers by exit code", async () => {
  const spawnFn = fakeSpawn((command) => (command === "systemctl" ? 0 : 1));
  const result = await probeHost(
    host({ sshTarget: "box", statusCommand: { command: "systemctl", args: ["is-active", "sshd"] } }),
    { spawnImpl: spawnFn, timeoutSeconds: 4 },
  );
  assert.equal(result.state, "up");
  assert.equal(result.probedVia, "statusCommand");
  assert.deepEqual(spawnFn.calls[0].args, ["is-active", "sshd"]);

  const down = await probeHost(
    host({ sshTarget: "box", statusCommand: { command: "false" } }),
    { spawnImpl: fakeSpawn([1]), timeoutSeconds: 4 },
  );
  assert.equal(down.state, "down");
});

test("a host with no probe configured is unknown, not down", async () => {
  const result = await probeHost(host(), { spawnImpl: fakeSpawn([0]), timeoutSeconds: 2 });
  assert.equal(result.state, "unknown");
  assert.equal(result.probedVia, "none");
});

const MICROLINK = { type: "microlink" as const, host: "cyril.tailnet", port: 49152 };

test("the observer answers a microlink host before ssh is consulted", async () => {
  const spawnFn = fakeSpawn((command) => (command === "ssh" ? 0 : 1));
  const observer = fakeObserver([{ targetAwake: true }]);
  const up = await probeHost(host({ sshTarget: "build.example.net", wakeTransports: [MICROLINK] }), {
    spawnImpl: spawnFn,
    observeImpl: observer,
    timeoutSeconds: 2,
  });
  assert.equal(up.state, "up");
  assert.equal(up.probedVia, "observer");
  assert.deepEqual(observer.calls, [{ host: "cyril.tailnet", port: 49152 }]);
  assert.equal(spawnFn.calls.length, 0, "a definitive observer answer means ssh never runs");

  const down = await probeHost(host({ sshTarget: "build.example.net", wakeTransports: [MICROLINK] }), {
    spawnImpl: spawnFn,
    observeImpl: fakeObserver([{ targetAwake: false }]),
    timeoutSeconds: 2,
  });
  assert.equal(down.state, "down", "the device's own target_awake=false is an answer, not a fall-through");
  assert.equal(down.probedVia, "observer");

  const portless = await probeHost(
    host({ sshTarget: "build.example.net", wakeTransports: [{ type: "microlink", host: "cyril.tailnet" }] }),
    { spawnImpl: spawnFn, observeImpl: fakeObserver([{ targetAwake: true }]), timeoutSeconds: 2 },
  );
  assert.equal(portless.probedVia, "observer");
});

test("no observer answer falls through to ssh; ssh-only hosts never ask the observer", async () => {
  const spawnFn = fakeSpawn((command) => (command === "ssh" ? 0 : 1));
  const observer = fakeObserver([null]);
  const fallenThrough = await probeHost(host({ sshTarget: "build.example.net", wakeTransports: [MICROLINK] }), {
    spawnImpl: spawnFn,
    observeImpl: observer,
    timeoutSeconds: 2,
  });
  assert.equal(fallenThrough.state, "up", "ssh answers after the observer stays silent");
  assert.equal(fallenThrough.probedVia, "ssh");
  assert.deepEqual(observer.calls, [{ host: "cyril.tailnet", port: 49152 }]);

  const sshOnly = fakeObserver([{ targetAwake: true }]);
  const untouched = await probeHost(host({ sshTarget: "build.example.net", wakeTransports: [{ type: "wol", mac: "00:11:22:33:44:55" }] }), {
    spawnImpl: fakeSpawn([0]),
    observeImpl: sshOnly,
    timeoutSeconds: 2,
  });
  assert.equal(untouched.state, "up");
  assert.equal(untouched.probedVia, "ssh", "a host without a microlink transport keeps the ssh channel");
  assert.equal(sshOnly.calls.length, 0);
});

test("statusCommand still outranks the observer", async () => {
  const observer = fakeObserver([{ targetAwake: false }]);
  const result = await probeHost(
    host({
      statusCommand: { command: "systemctl", args: ["is-active", "sshd"] },
      wakeTransports: [MICROLINK],
    }),
    { spawnImpl: fakeSpawn([0]), observeImpl: observer, timeoutSeconds: 2 },
  );
  assert.equal(result.state, "up");
  assert.equal(result.probedVia, "statusCommand");
  assert.equal(observer.calls.length, 0, "the custom command wins and the observer is not asked");
});

test("the real spawner reports exit codes for actual children", async () => {
  const up = await realSpawn("node", ["-e", "process.exit(0)"], 5_000);
  const down = await realSpawn("node", ["-e", "process.exit(3)"], 5_000);
  assert.equal(up.code, 0);
  assert.equal(down.code, 3);
});
