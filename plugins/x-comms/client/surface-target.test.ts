import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSurfaceTargetResolvable,
  isSurfaceTargetResolvable,
  surfaceUnconfiguredMessage,
} from "./surface-target.ts";

const DAEMONS = [
  { name: "lab", valid: true, serverId: "srv_lab123" },
  { name: "broken", valid: false },
];

describe("client surface target gate (#842)", () => {
  it("resolves a valid enabled daemon", () => {
    assert.equal(
      isSurfaceTargetResolvable({ daemon: "lab", daemons: DAEMONS, daemonEnabled: {} }),
      true,
    );
  });

  it("a missing daemon is unconfigured with guidance, never healthy", () => {
    assert.equal(
      isSurfaceTargetResolvable({ daemon: "ghost", daemons: DAEMONS, daemonEnabled: {} }),
      false,
    );
    const message = surfaceUnconfiguredMessage("ghost");
    assert.match(message, /unknown daemon 'ghost'/);
    assert.match(message, /x_comms_add_daemon/);
    assert.match(message, /x_comms_list_daemons/);
  });

  it("an invalid entry is unconfigured, not sendable", () => {
    assert.equal(
      isSurfaceTargetResolvable({ daemon: "broken", daemons: DAEMONS, daemonEnabled: {} }),
      false,
    );
  });

  it("resolves the same entry by serverId, like the send path", () => {
    assert.equal(
      isSurfaceTargetResolvable({ daemon: "srv_lab123", daemons: DAEMONS, daemonEnabled: {} }),
      true,
    );
  });

  it("a switched-off daemon is unconfigured", () => {
    assert.equal(
      isSurfaceTargetResolvable({ daemon: "lab", daemons: DAEMONS, daemonEnabled: { lab: false } }),
      false,
    );
  });

  it("an unresolvable target does not dispatch from the surface path", async () => {
    // The surface resolves via the registry before offering a send: the guarded
    // send throws the actionable diagnostic and never reaches the transport.
    let dispatched = 0;
    const callSend = async () => {
      dispatched += 1;
      return { daemon: "ghost", agentId: "a", ok: true, error: null };
    };
    const guardedSend = async () => {
      assertSurfaceTargetResolvable({ daemon: "ghost", daemons: DAEMONS, daemonEnabled: {} });
      await callSend();
    };
    await assert.rejects(guardedSend, /unknown daemon 'ghost'/);
    assert.equal(dispatched, 0, "an unresolvable surface target must not dispatch");
    assert.match(String(await guardedSend().catch((e: unknown) => (e as Error).message)), /x_comms_add_daemon/);
  });
});
