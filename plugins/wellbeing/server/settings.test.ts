import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PresenceTracker } from "./presence.js";
import {
  WellbeingSettingsHandle,
  registerWellbeingServerSettings,
  type SettingsHandleLike,
  type PluginSettingsStateLike,
} from "./settings.js";
import {
  DEFAULT_SETTINGS,
  WELLBEING_SETTINGS_ID,
  wellbeingSettingsDefinition,
  statusRpc,
  type WellbeingSettings,
} from "../shared/contracts.js";
import contribute from "../index.server.js";

class FakeSettingsHandle implements SettingsHandleLike<WellbeingSettings> {
  public currentState: PluginSettingsStateLike<WellbeingSettings>;
  public listeners: Array<(state: PluginSettingsStateLike<WellbeingSettings>) => void> = [];
  public readCalls = 0;
  public unsubscribed = false;

  constructor(initial: PluginSettingsStateLike<WellbeingSettings>) {
    this.currentState = initial;
  }

  async read(): Promise<PluginSettingsStateLike<WellbeingSettings>> {
    this.readCalls += 1;
    return this.currentState;
  }

  subscribe(listener: (state: PluginSettingsStateLike<WellbeingSettings>) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.unsubscribed = true;
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  emit(next: PluginSettingsStateLike<WellbeingSettings>): void {
    this.currentState = next;
    for (const listener of [...this.listeners]) {
      listener(next);
    }
  }
}

describe("WellbeingSettingsHandle & registerSettings", () => {
  it("initializes from native handle read() and updates PresenceTracker", async () => {
    const customSettings: WellbeingSettings = {
      ...DEFAULT_SETTINGS,
      windDownTime: "23:45",
      wakeUpTime: "08:15",
      maxSessionContinuousMinutes: 120,
    };

    const fakeHandle = new FakeSettingsHandle({
      status: "ready",
      revision: "rev-init",
      values: customSettings,
    });

    const tracker = new PresenceTracker(DEFAULT_SETTINGS);
    const handle = new WellbeingSettingsHandle(fakeHandle, tracker, DEFAULT_SETTINGS);

    assert.equal(handle.isAvailable(), true);
    assert.equal(handle.getReadCount(), 0);
    assert.equal(handle.isSubscribed(), false);

    await handle.initialize();

    assert.equal(handle.isSubscribed(), true);
    assert.equal(handle.getReadCount(), 1);
    assert.deepEqual(tracker.getSettings().windDownTime, "23:45");
    assert.deepEqual(tracker.getSettings().wakeUpTime, "08:15");
    assert.equal(tracker.getSettings().maxSessionContinuousMinutes, 120);
    assert.deepEqual(handle.getSettings().windDownTime, "23:45");
  });

  it("subscribes and updates PresenceTracker on settings change notifications", async () => {
    const fakeHandle = new FakeSettingsHandle({
      status: "ready",
      revision: "rev-1",
      values: DEFAULT_SETTINGS,
    });

    const tracker = new PresenceTracker(DEFAULT_SETTINGS);
    const handle = new WellbeingSettingsHandle(fakeHandle, tracker, DEFAULT_SETTINGS);
    await handle.initialize();

    assert.equal(handle.getEventCount(), 0);

    const updatedSettings: WellbeingSettings = {
      ...DEFAULT_SETTINGS,
      bedMode: true,
      windDownTime: "21:00",
      notifyVia2fado: false,
    };

    fakeHandle.emit({
      status: "ready",
      revision: "rev-2",
      values: updatedSettings,
    });

    assert.equal(handle.getEventCount(), 1);
    assert.equal(handle.getLastEventStatus(), "ready");
    assert.ok(handle.getLastEventAt());
    assert.equal(tracker.getSettings().bedMode, true);
    assert.equal(tracker.getSettings().windDownTime, "21:00");
    assert.equal(tracker.getSettings().notifyVia2fado, false);

    // Verify tracker status reflects the new settings
    const status = tracker.getStatus();
    assert.equal(status.settings.bedMode, true);
    assert.equal(status.settings.windDownTime, "21:00");
  });

  it("handles invalid read and invalid change states gracefully", async () => {
    const fakeHandle = new FakeSettingsHandle({
      status: "invalid",
      revision: "rev-err",
      error: "Malformed JSON on disk",
    });

    const tracker = new PresenceTracker(DEFAULT_SETTINGS);
    const handle = new WellbeingSettingsHandle(fakeHandle, tracker, DEFAULT_SETTINGS);
    await handle.initialize();

    // Tracker should retain DEFAULT_SETTINGS
    assert.deepEqual(tracker.getSettings(), DEFAULT_SETTINGS);

    // Emitting invalid state keeps previous settings
    fakeHandle.emit({
      status: "invalid",
      revision: "rev-err-2",
      error: "Schema validation failure",
    });

    assert.equal(handle.getEventCount(), 1);
    assert.equal(handle.getLastEventStatus(), "invalid");
    assert.deepEqual(tracker.getSettings(), DEFAULT_SETTINGS);
  });

  it("handles read() throwing an unexpected exception", async () => {
    const fakeHandle: SettingsHandleLike<WellbeingSettings> = {
      read: async () => {
        throw new Error("Disk read failure");
      },
      subscribe: () => () => {},
    };

    const tracker = new PresenceTracker(DEFAULT_SETTINGS);
    const handle = new WellbeingSettingsHandle(fakeHandle, tracker, DEFAULT_SETTINGS);
    await handle.initialize();

    assert.deepEqual(tracker.getSettings(), DEFAULT_SETTINGS);
  });

  it("degrades cleanly when registerSettings() returns void (Paseo SDK < 0.9)", async () => {
    let capturedDefinition: unknown;
    const fakeServer = {
      registerSettings(def: unknown) {
        capturedDefinition = def;
        return undefined; // SDK < 0.9 returns void
      },
    };

    const tracker = new PresenceTracker(DEFAULT_SETTINGS);
    const handle = registerWellbeingServerSettings(fakeServer as any, tracker, DEFAULT_SETTINGS);

    assert.equal(handle.isAvailable(), false);
    assert.ok(handle.getUnavailableReason()?.includes("Paseo < 0.9.0-beta.1"));
    assert.deepEqual(capturedDefinition, wellbeingSettingsDefinition);
    assert.deepEqual(tracker.getSettings(), DEFAULT_SETTINGS);

    handle.dispose();
  });

  it("unsubscribes on dispose", async () => {
    const fakeHandle = new FakeSettingsHandle({
      status: "ready",
      revision: "rev-1",
      values: DEFAULT_SETTINGS,
    });

    const tracker = new PresenceTracker(DEFAULT_SETTINGS);
    const handle = new WellbeingSettingsHandle(fakeHandle, tracker, DEFAULT_SETTINGS);
    await handle.initialize();

    assert.equal(handle.isSubscribed(), true);
    assert.equal(fakeHandle.unsubscribed, false);

    handle.dispose();
    assert.equal(handle.isSubscribed(), false);
    assert.equal(fakeHandle.unsubscribed, true);
  });

  it("wires correctly inside contribute() and responds to RPCs", async () => {
    const rpcHandlers = new Map<string, (input: any) => Promise<any> | any>();
    const eventHandlers = new Map<string, (event: any) => void>();

    const fakeHandle = new FakeSettingsHandle({
      status: "ready",
      revision: "rev-plugin",
      values: DEFAULT_SETTINGS,
    });

    let passedDefinition: any = null;
    const fakeServer = {
      registerSettings(def: any) {
        passedDefinition = def;
        return fakeHandle;
      },
      handle(contract: { name: string }, handler: any) {
        rpcHandlers.set(contract.name, handler);
      },
      on(event: string, handler: any) {
        eventHandlers.set(event, handler);
        return () => {
          eventHandlers.delete(event);
        };
      },
    };

    const cleanup = contribute(fakeServer as any);

    assert.equal(passedDefinition.id, WELLBEING_SETTINGS_ID);
    assert.ok(rpcHandlers.has("wellbeing.status"));
    assert.ok(rpcHandlers.has("wellbeing.toggle_bed_mode"));
    assert.ok(rpcHandlers.has("wellbeing.snooze_alert"));
    assert.ok(rpcHandlers.has("wellbeing.record_activity"));
    assert.ok(eventHandlers.has("agent.turn_ended"));
    assert.ok(eventHandlers.has("agent.permission_resolved"));

    // Allow initialize() promise to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify initial status RPC
    const statusHandler = rpcHandlers.get("wellbeing.status")!;
    let status = await statusHandler({});
    assert.equal(status.settings.windDownTime, "22:30");

    // Simulate settings update through the native handle
    fakeHandle.emit({
      status: "ready",
      revision: "rev-plugin-2",
      values: {
        ...DEFAULT_SETTINGS,
        windDownTime: "23:15",
      },
    });

    status = await statusHandler({});
    assert.equal(status.settings.windDownTime, "23:15");

    // Cleanup
    cleanup();
    assert.equal(fakeHandle.unsubscribed, true);
  });
});
