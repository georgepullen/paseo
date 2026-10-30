import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STATUS_SEGMENTS, type HostRecord } from "../shared/registry.ts";
import { appendSamples, loadHistory, sampleHost, toStrip } from "./history.ts";

const HOUR = 60 * 60_000;
const now = 1_800_000_000_000;

function host(overrides: Partial<HostRecord> = {}): HostRecord {
  return { id: "box", name: "box", wakeTransports: [], createdAt: 0, updatedAt: 0, ...overrides };
}

const microlink = { type: "microlink" as const, host: "192.0.2.7" };

describe("probe history", () => {
  it("folds samples into 96 fifteen-minute segments, leaving gaps null", () => {
    const strip = toStrip(
      [
        { t: now - 23.9 * HOUR, up: 1 },
        { t: now - 23.9 * HOUR + 60_000, up: 0 },
        { t: now - 60_000, up: 1 },
        { t: now - 25 * HOUR, up: 1 },
        { t: now - 30_000, board: 0 },
      ],
      "up",
      now,
    );
    assert.equal(strip.length, STATUS_SEGMENTS);
    assert.equal(strip[0], 0.5);
    assert.equal(strip[STATUS_SEGMENTS - 1], 1);
    assert.equal(strip.filter((value) => value !== null).length, 2);
  });

  it("appends per host, prunes past 24h, and drops hosts no longer sampled", () => {
    const dir = mkdtempSync(join(tmpdir(), "rp-history-"));
    appendSamples({ box: { t: now - 25 * HOUR, up: 1 }, gone: { t: now - HOUR, up: 1 } }, now - 25 * HOUR, dir);
    appendSamples({ box: { t: now - HOUR, up: 0 } }, now, dir);
    assert.deepEqual(loadHistory("box", dir), [{ t: now - HOUR, up: 0 }]);
    assert.deepEqual(loadHistory("gone", dir), []);
  });

  it("records the wake board from the probe's own observer answer", async () => {
    let calls = 0;
    const sample = await sampleHost(host({ wakeTransports: [microlink] }), now, {
      observeImpl: async () => {
        calls++;
        return { targetAwake: true, rssi: -60 };
      },
    });
    assert.deepEqual(sample, { t: now, up: 1, board: 1, rssi: -60 });
    assert.equal(calls, 1);
  });

  it("marks the board unreachable and leaves state unknown without a probe channel", async () => {
    const sample = await sampleHost(host({ wakeTransports: [microlink] }), now, { observeImpl: async () => null });
    assert.deepEqual(sample, { t: now, board: 0 });
    assert.deepEqual(await sampleHost(host(), now), { t: now });
  });

  it("still asks the board when a status command decides the state", async () => {
    const sample = await sampleHost(
      host({ wakeTransports: [microlink], statusCommand: { command: "probe" } }),
      now,
      { spawnImpl: async () => ({ code: 1 }), observeImpl: async () => ({ targetAwake: true, rssi: null }) },
    );
    assert.deepEqual(sample, { t: now, up: 0, board: 1 });
  });
});
