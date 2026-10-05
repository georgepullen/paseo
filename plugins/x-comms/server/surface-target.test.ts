import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { UnresolvableTargetError } from "./busy.ts";
import { unknownDaemonMessage } from "./unknown-daemon.ts";
import { assertSurfaceTargetResolvable, isResolvableDaemon } from "./surface-target.ts";
import type { RegistryDaemon } from "./registry.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const handlersSrc = readFileSync(join(HERE, "handlers.ts"), "utf8");

function daemon(over: Partial<RegistryDaemon> = {}): RegistryDaemon {
  return { name: "lab", value: "10.0.0.5:6767", valid: true, error: null, ...over };
}

const enabled = () => true;
const disabled = (name: string) => name !== "lab";

describe("surface target resolution (#842)", () => {
  it("resolves a valid enabled entry", () => {
    const entry = assertSurfaceTargetResolvable("lab", [daemon()], enabled);
    assert.equal(entry.name, "lab");
  });

  it("an unresolvable name throws the #851 diagnostic, not null", () => {
    assert.throws(() => assertSurfaceTargetResolvable("ghost", [daemon()], enabled), (cause: unknown) => {
      assert.ok(cause instanceof UnresolvableTargetError);
      assert.equal((cause as UnresolvableTargetError).daemon, "ghost");
      assert.match((cause as Error).message, /unknown daemon 'ghost'/);
      assert.match((cause as Error).message, /x_comms_add_daemon/);
      assert.match((cause as Error).message, /x_comms_list_daemons/);
      return true;
    });
  });

  it("an invalid entry is unresolvable, not a healthy send target", () => {
    assert.equal(isResolvableDaemon(daemon({ valid: false, error: "bad host" }), enabled), false);
    assert.throws(() => assertSurfaceTargetResolvable("lab", [daemon({ valid: false })], enabled), (cause: unknown) => {
      assert.ok(cause instanceof UnresolvableTargetError);
      return true;
    });
  });

  it("a switched-off daemon is unresolvable", () => {
    assert.equal(isResolvableDaemon(daemon(), disabled), false);
    assert.throws(() => assertSurfaceTargetResolvable("lab", [daemon()], disabled), UnresolvableTargetError);
  });

  it("matches the unknown-daemon diagnostic the send path refuses with", () => {
    assert.match(unknownDaemonMessage("ghost"), /x_comms_add_daemon/);
    assert.match(unknownDaemonMessage("ghost"), /x_comms_list_daemons/);
  });
});

/**
 * handlers.ts reaches the vendored helper, whose TypeScript parameter
 * properties Node's strip-only loader rejects, so the introduce wiring is
 * asserted on the source instead — the same pattern unresolvable-target.test.ts
 * uses for the #842 send gate.
 */
describe("introduce surface does not dispatch unresolvable targets (#842)", () => {
  function introduceBody(): string {
    return handlersSrc.slice(
      handlersSrc.indexOf("export async function handleIntroduceAgents"),
      handlersSrc.indexOf("export async function handleServerStatus"),
    );
  }

  it("resolves both targets via the registry before offering a dispatch", () => {
    const body = introduceBody();
    assert.ok(body.includes("targetRegistryEntry"), "must resolve via the registry before sending");
    assert.ok(body.includes("unknownDaemonMessage"), "must reuse the #851 diagnostic");
  });

  it("returns the refusal without creating a dispatch client", () => {
    const body = introduceBody();
    const guardAt = body.indexOf("targetRegistryEntry(target.daemon)");
    const clientAt = body.indexOf("new McpStdioClient");
    assert.ok(guardAt > 0 && clientAt > guardAt, "the registry guard must precede any dispatch client");
    assert.ok(body.includes("ok: false"), "the unresolvable target is refused, not dispatched");
  });

  it("the shared lookup treats invalid and switched-off entries as unresolvable", () => {
    const lookup = handlersSrc.slice(
      handlersSrc.indexOf("function targetRegistryEntry"),
      handlersSrc.indexOf("function chatEnabledDaemon"),
    );
    // Both the alias and the direct path must agree; a filter on one side only
    // reintroduces the #639-style bypass for the other spelling.
    assert.equal(
      (lookup.match(/chatEnabledDaemon/g) ?? []).length >= 2,
      true,
      "both resolution paths must filter through chatEnabledDaemon",
    );
    const filter = handlersSrc.slice(
      handlersSrc.indexOf("function chatEnabledDaemon"),
      handlersSrc.indexOf("async function fetchPeerServerInfo"),
    );
    assert.ok(filter.includes("!daemon.valid"), "an invalid entry must not resolve");
    assert.ok(filter.includes("resolveDaemonEnabled"), "a switched-off daemon must not resolve");
  });
});
