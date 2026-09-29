import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { SettingsDefinition } from "@getpaseo/plugin";
import { createPluginLogger } from "paseo-plugin-helper/server";
import {
  WellbeingSettingsSchema,
  wellbeingSettingsDefinition,
  DEFAULT_SETTINGS,
  type WellbeingSettings,
} from "../shared/contracts.js";
import type { PresenceTracker } from "./presence.js";

const log = createPluginLogger("wellbeing");

export type WellbeingSettingsHandleState =
  | { status: "ready"; revision: string; values: WellbeingSettings }
  | { status: "invalid"; revision: string; error: string };

/**
 * Structural shape of upstream's 0.9 `PluginSettings` handle. Typed locally so
 * the module compiles and degrades cleanly on the 0.8 SDK, where
 * `registerSettings()` returns `void` and no handle exists.
 */
export interface SettingsHandleLike<T = unknown> {
  read(): Promise<PluginSettingsStateLike<T>>;
  subscribe(listener: (state: PluginSettingsStateLike<T>) => void | Promise<void>): () => void;
}

export type PluginSettingsStateLike<T = unknown> =
  | { status: "ready"; revision: string; values: T }
  | { status: "invalid"; revision: string; error: string };

interface RegisterSettingsCapable {
  registerSettings(definition: SettingsDefinition<typeof wellbeingSettingsDefinition.schema>): unknown;
}

export function isSettingsHandle(value: unknown): value is SettingsHandleLike<WellbeingSettings> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { read?: unknown; subscribe?: unknown };
  return typeof candidate.read === "function" && typeof candidate.subscribe === "function";
}

export class WellbeingSettingsHandle {
  private readonly handle: SettingsHandleLike<WellbeingSettings> | null;
  private readonly tracker: PresenceTracker;
  private readonly unavailableReason: string | null;
  private unsubscribe: (() => void) | null = null;
  private current: WellbeingSettings;
  private currentState: WellbeingSettingsHandleState | null = null;
  private readCount = 0;
  private eventCount = 0;
  private lastEventAt: string | null = null;
  private lastEventStatus: "ready" | "invalid" | null = null;
  private subscribed = false;

  constructor(
    handle: SettingsHandleLike<WellbeingSettings> | null,
    tracker: PresenceTracker,
    initialSettings: WellbeingSettings = DEFAULT_SETTINGS,
    unavailableReason: string | null = null
  ) {
    this.handle = handle;
    this.tracker = tracker;
    this.current = initialSettings;
    this.unavailableReason = unavailableReason;
  }

  isAvailable(): boolean {
    return this.handle !== null;
  }

  getUnavailableReason(): string | null {
    return this.unavailableReason;
  }

  getSettings(): WellbeingSettings {
    return this.current;
  }

  getState(): WellbeingSettingsHandleState | null {
    return this.currentState;
  }

  getReadCount(): number {
    return this.readCount;
  }

  getEventCount(): number {
    return this.eventCount;
  }

  getLastEventAt(): string | null {
    return this.lastEventAt;
  }

  getLastEventStatus(): "ready" | "invalid" | null {
    return this.lastEventStatus;
  }

  isSubscribed(): boolean {
    return this.subscribed;
  }

  async initialize(): Promise<void> {
    if (this.handle) {
      this.unsubscribe = this.handle.subscribe((state) => {
        this.eventCount += 1;
        this.lastEventAt = new Date().toISOString();
        this.lastEventStatus = state.status;
        this.currentState = state as WellbeingSettingsHandleState;
        if (state.status === "ready") {
          const parsed = WellbeingSettingsSchema.safeParse(state.values);
          if (parsed.success) {
            this.current = parsed.data;
            this.tracker.updateSettings(parsed.data);
            log.info("wellbeing settings updated", {
              bedMode: parsed.data.bedMode,
              windDown: parsed.data.windDownTime,
              revision: state.revision,
            });
          } else {
            log.warn("wellbeing settings handle observed invalid data", {
              errors: parsed.error.issues,
              revision: state.revision,
            });
          }
        } else {
          log.warn("wellbeing settings handle observed invalid state", {
            error: state.error,
            revision: state.revision,
          });
        }
      });
      this.subscribed = true;
    }
    await this.refresh();
  }

  async refresh(): Promise<WellbeingSettingsHandleState | null> {
    if (!this.handle) return null;
    try {
      const state = (await this.handle.read()) as WellbeingSettingsHandleState;
      this.readCount += 1;
      this.currentState = state;
      if (state.status === "ready") {
        const parsed = WellbeingSettingsSchema.safeParse(state.values);
        if (parsed.success) {
          this.current = parsed.data;
          this.tracker.updateSettings(parsed.data);
          log.info("wellbeing initial settings loaded from native handle", {
            bedMode: parsed.data.bedMode,
            windDown: parsed.data.windDownTime,
            revision: state.revision,
          });
        } else {
          log.warn("wellbeing initial settings invalid, keeping defaults", {
            errors: parsed.error.issues,
          });
        }
      } else {
        log.warn("wellbeing settings handle read returned invalid, keeping defaults", {
          error: state.error,
        });
      }
      return state;
    } catch (error) {
      log.error("wellbeing settings handle read failed", error);
      return null;
    }
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.subscribed = false;
  }
}

export function registerWellbeingServerSettings(
  server: PluginServerContext,
  tracker: PresenceTracker,
  initialSettings: WellbeingSettings = DEFAULT_SETTINGS
): WellbeingSettingsHandle {
  const capable = server as unknown as RegisterSettingsCapable;
  const returned = typeof capable?.registerSettings === "function"
    ? capable.registerSettings(wellbeingSettingsDefinition)
    : undefined;

  let handle: SettingsHandleLike<WellbeingSettings> | null = null;
  let reason: string | null = null;
  if (isSettingsHandle(returned)) {
    handle = returned;
  } else {
    reason =
      "registerSettings() did not return a PluginSettings handle. On Paseo < 0.9.0-beta.1 it returns void (the handle shipped in 0.9.0-beta.1, upstream PR #4674); running with default settings.";
    log.warn(reason);
  }

  const settingsHandle = new WellbeingSettingsHandle(handle, tracker, initialSettings, reason);
  void settingsHandle.initialize().catch((error) => {
    log.error("Wellbeing settings handle failed to initialize", error);
  });
  return settingsHandle;
}
