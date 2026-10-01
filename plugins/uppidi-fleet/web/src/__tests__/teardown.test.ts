import { describe, expect, it } from "vitest";
import { buildTeardownInput, DaemonConnection } from "../daemon/connection.js";

describe("buildTeardownInput", () => {
  it("always sends confirm:true with deduplicated targets", () => {
    expect(buildTeardownInput(["workers", "workers", "frontdesk"])).toEqual({
      targets: ["workers", "frontdesk"],
      confirm: true,
    });
  });

  it("rejects an empty target selection", () => {
    expect(() => buildTeardownInput([])).toThrow("Select at least one teardown target.");
  });
});

describe("DaemonConnection.backoffForAttempt", () => {
  it("grows exponentially and caps at 30s", () => {
    expect(DaemonConnection.backoffForAttempt(0)).toBe(1_000);
    expect(DaemonConnection.backoffForAttempt(1)).toBe(2_000);
    expect(DaemonConnection.backoffForAttempt(5)).toBe(30_000);
    expect(DaemonConnection.backoffForAttempt(99)).toBe(30_000);
  });
});
