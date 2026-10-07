import { createPluginLogger, createSettingsHandlers, PluginStorage } from "paseo-plugin-helper/server";
import {
  researchFeedSettings,
  researchFeedSettingsSchema,
  type ResearchFeedSettings,
} from "../shared/settings.ts";

/**
 * Settings persistence: the researchFeedSettings contract (get/update/reset
 * RPCs) backed by an atomic PluginStorage document in the plugin state dir.
 * Handler trio is created here and registered in index.server.ts (demo
 * pattern), so the host's AST-based client compiler can strip server
 * registrations from the client bundle.
 */

const log = createPluginLogger("paseo-research-feed", { subsystem: "settings" });

export const settingsStorage = new PluginStorage<ResearchFeedSettings>(
  "paseo-research-feed",
  "settings.json",
  { schema: researchFeedSettingsSchema },
);

export const settingsHandlers = createSettingsHandlers(researchFeedSettings, settingsStorage, {
  onUpdate: (next: ResearchFeedSettings) => {
    log.info("research feed settings updated", {
      feedSize: next.feedSize,
      vendor: next.vendor,
      eagerDigests: next.eagerDigests,
    });
  },
});

/** Read current settings (defaults applied by the schema). */
export async function currentSettings(): Promise<ResearchFeedSettings> {
  return settingsStorage.readAsync();
}
