import { PluginStorage } from "paseo-plugin-helper/server";
import { powerSettingsContract } from "../shared/registry.ts";
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from "./wake-engine.ts";

/**
 * Settings resolution for the wake engine. Persistence lives in a
 * PluginStorage-backed document validated by the settings contract schema
 * (the same pattern plugins/top uses); the pure resolve/clamp logic here is
 * what the engine and the RPC handlers call, so a corrupt or partial file
 * degrades to documented defaults instead of failing every wake.
 */

export type PowerSettings = {
  defaultWakeWindowSeconds: number;
  probeTimeoutSeconds: number;
  maxConcurrentWakes: number;
  agentInjectionEnabled: boolean;
};

export const DEFAULT_POWER_SETTINGS: PowerSettings = {
  ...DEFAULT_ENGINE_SETTINGS,
  agentInjectionEnabled: true,
};

export function settingsStore() {
  return new PluginStorage<PowerSettings>("paseo-remote-power", "settings.json", {
    schema: powerSettingsContract.schema,
  });
}

/**
 * Clamp a stored number into the contract's documented range; the defaults
 * match the source script this plugin generalizes (110s wake window, 8s
 * ConnectTimeout).
 */
function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function resolveSettings(raw: Partial<PowerSettings> | null | undefined): PowerSettings {
  return {
    defaultWakeWindowSeconds: clampNumber(
      raw?.defaultWakeWindowSeconds,
      DEFAULT_POWER_SETTINGS.defaultWakeWindowSeconds,
      10,
      600,
    ),
    probeTimeoutSeconds: clampNumber(raw?.probeTimeoutSeconds, DEFAULT_POWER_SETTINGS.probeTimeoutSeconds, 1, 60),
    maxConcurrentWakes: clampNumber(raw?.maxConcurrentWakes, DEFAULT_POWER_SETTINGS.maxConcurrentWakes, 1, 8),
    agentInjectionEnabled: raw?.agentInjectionEnabled !== false,
  };
}

export function readSettings(): PowerSettings {
  try {
    return resolveSettings(settingsStore().read());
  } catch {
    return DEFAULT_POWER_SETTINGS;
  }
}

export function engineSettingsFrom(power: PowerSettings): EngineSettings {
  return {
    defaultWakeWindowSeconds: power.defaultWakeWindowSeconds,
    probeTimeoutSeconds: power.probeTimeoutSeconds,
    maxConcurrentWakes: power.maxConcurrentWakes,
  };
}
