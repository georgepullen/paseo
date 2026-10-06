import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addHost,
  findHost,
  loadHosts,
  loadTokens,
  removeHost,
  resolveToken,
  stateDir,
  updateHost,
} from "./registry.ts";
import type { HostRecord } from "../shared/registry.ts";

/**
 * The hosts registry and the token store are separate documents in the plugin
 * state dir: hosts.json carries token REFS, tokens.json carries the secrets.
 * These tests run against a fixture directory — never the real HOME.
 */

function fixtureDir(): string {
  return mkdtempSync(join(tmpdir(), "remote-power-registry-"));
}

function hostInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "build-box",
    wakeTransports: [{ type: "http" as const, url: "http://192.0.2.10/wake" }],
    ...overrides,
  };
}

test("stateDir derives from the plugin state dir, not the repo", () => {
  const dir = stateDir();
  assert.ok(dir.includes("paseo-remote-power"), "the state dir is namespaced per plugin");
  assert.match(dir, /\.paseo/);
});

test("add, find, and list round-trip a host through hosts.json", () => {
  const baseDir = fixtureDir();
  try {
    const added = addHost(hostInput({ sshTarget: "build.example.net" }), baseDir);
    assert.equal(added.saved, true);
    assert.equal(added.error, null);
    const host = added.host as HostRecord;
    assert.match(host.id, /^host-/);
    assert.equal(host.wakeTransports.length, 1);
    assert.equal(host.createdAt, host.updatedAt);

    assert.deepEqual(findHost(host.id, baseDir), host);
    assert.deepEqual(loadHosts(baseDir), [host]);
    assert.equal(addHost(hostInput(), baseDir).saved, false, "duplicate names are rejected");
    assert.equal(findHost("host-missing", baseDir), null);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("the token never lands in hosts.json — only its ref does", () => {
  const baseDir = fixtureDir();
  try {
    const added = addHost(
      hostInput({
        wakeTransports: [{ type: "http", url: "http://192.0.2.10/wake" }],
        token: "super-secret-value",
      }),
      baseDir,
    );
    assert.equal(added.saved, true);
    const host = added.host as HostRecord;
    const transport = host.wakeTransports[0] as { type: string; url: string; tokenRef?: string };
    assert.equal(transport.tokenRef, `token-${host.id}`, "the auto ref is wired onto the http transport");

    const rawHostsFile = readFileSync(join(baseDir, "paseo-remote-power", "hosts.json"), "utf8");
    assert.equal(rawHostsFile.includes("super-secret-value"), false, "hosts.json must not carry the secret");
    assert.deepEqual(resolveToken(transport.tokenRef, baseDir), "super-secret-value");
    assert.deepEqual(loadTokens(baseDir), { [`token-${host.id}`]: "super-secret-value" });
    assert.equal(resolveToken(undefined, baseDir), null);
    assert.equal(resolveToken("no-such-ref", baseDir), null);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("an explicit tokenRef wins over the generated one", () => {
  const baseDir = fixtureDir();
  try {
    const added = addHost(
      hostInput({ token: "tok", tokenRef: "build-wake" }),
      baseDir,
    );
    const host = added.host as HostRecord;
    const transport = host.wakeTransports[0] as { tokenRef?: string };
    assert.equal(transport.tokenRef, "build-wake");
    assert.deepEqual(resolveToken("build-wake", baseDir), "tok");
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("update merges, clears optional fields on explicit null, and re-wires fresh tokens", () => {
  const baseDir = fixtureDir();
  try {
    const added = addHost(hostInput({ sshTarget: "old.example.net", wakeWindowSeconds: 60 }), baseDir);
    const host = added.host as HostRecord;

    const renamed = updateHost({ id: host.id, name: "renamed-box" }, baseDir);
    assert.equal(renamed.saved, true);
    assert.equal(renamed.host?.name, "renamed-box");
    assert.equal(renamed.host?.sshTarget, "old.example.net");
    assert.ok((renamed.host?.updatedAt ?? 0) >= host.updatedAt);

    const cleared = updateHost({ id: host.id, sshTarget: null, wakeWindowSeconds: null }, baseDir);
    assert.equal(cleared.saved, true);
    assert.equal(cleared.host?.sshTarget, undefined);
    assert.equal(cleared.host?.wakeWindowSeconds, undefined);

    const withToken = updateHost({ id: host.id, token: "fresh-secret" }, baseDir);
    const transport = withToken.host?.wakeTransports[0] as { type: string; tokenRef?: string };
    assert.ok(transport.tokenRef);
    assert.deepEqual(resolveToken(transport.tokenRef, baseDir), "fresh-secret");

    assert.equal(updateHost({ id: "host-missing", name: "x" }, baseDir).saved, false);
    assert.equal(updateHost({ id: host.id, wakeWindowSeconds: 1 }, baseDir).saved, false, "out-of-range windows are rejected");
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("remove deletes only the named host and errors on unknown ids", () => {
  const baseDir = fixtureDir();
  try {
    const first = addHost(hostInput({ name: "one" }), baseDir);
    const second = addHost(hostInput({ name: "two" }), baseDir);
    assert.equal(removeHost((first.host as HostRecord).id, baseDir).saved, true);
    assert.deepEqual(loadHosts(baseDir).map((entry) => entry.name), ["two"]);
    assert.equal(removeHost((second.host as HostRecord).id, baseDir).saved, true);
    assert.deepEqual(loadHosts(baseDir), []);
    assert.equal(removeHost("host-missing", baseDir).saved, false);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("a corrupt hosts file degrades to an empty registry instead of throwing", () => {
  const baseDir = fixtureDir();
  try {
    mkdirSync(join(baseDir, "paseo-remote-power"), { recursive: true });
    writeFileSync(join(baseDir, "paseo-remote-power", "hosts.json"), "{not json", "utf8");
    assert.deepEqual(loadHosts(baseDir), []);
    // And the store heals: a save after corruption produces a valid file again.
    const added = addHost(hostInput(), baseDir);
    assert.equal(added.saved, true);
    assert.ok(existsSync(join(baseDir, "paseo-remote-power", "hosts.json")));
    assert.equal(loadHosts(baseDir).length, 1);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});
