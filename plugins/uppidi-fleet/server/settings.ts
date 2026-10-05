import { join } from "node:path";
import { tmpdir } from "node:os";
import { PluginStorage, type PluginStorageOptions } from "paseo-plugin-helper/server";
import {
  uppidiFleetSettingsContract,
  type UppidiFleetSettings,
} from "../shared/contracts.js";

let settingsStorageInstance: PluginStorage<UppidiFleetSettings> | null = null;

export function getUppidiFleetSettingsStorage(
  options?: PluginStorageOptions<UppidiFleetSettings>,
): PluginStorage<UppidiFleetSettings> {
  if (!settingsStorageInstance || options) {
    const isTestMode = process.env.NODE_ENV === "test";
    const baseDir =
      options?.baseDir ??
      (isTestMode ? join(tmpdir(), `paseo-uppidi-fleet-test-${process.pid}`) : undefined);
    const storage = new PluginStorage<UppidiFleetSettings>(
      "uppidi-fleet",
      "settings.json",
      {
        schema: uppidiFleetSettingsContract.schema,
        defaultData: uppidiFleetSettingsContract.defaultSettings,
        ...options,
        ...(baseDir ? { baseDir } : {}),
      },
    );
    if (!options && !isTestMode) {
      settingsStorageInstance = storage;
    }
    return storage;
  }
  return settingsStorageInstance;
}

export function resetUppidiFleetSettingsStorageInstance(): void {
  settingsStorageInstance = null;
}
