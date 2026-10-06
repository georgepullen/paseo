import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import {
  Icon,
  Modal,
  useToast,
  ScrollView,
  FlatList,
  TextInput as HostTextInputPrimitive,
  copyText,
} from "@getpaseo/plugin/client/react-native";
import {
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { initClientHelpers, registerCommandCenterItem } from "paseo-plugin-helper/core";
import { registerSidebarSurface } from "paseo-plugin-helper/lifecycle";
import { registerHelperSettingsScreen } from "paseo-plugin-helper/ui";
import { researchFeedSettings } from "./shared/settings";
import { ResearchFeedSurface } from "./client/surface";

initClientHelpers({
  Icon,
  Modal,
  useRpc,
  useToast,
  copyText,
  ScrollView,
  FlatList,
  TextInput: HostTextInputPrimitive,
});

const SURFACE_ID = "research-feed";

export default function contribute(client: PluginClientContext) {
  registerSidebarSurface(client, {
    id: SURFACE_ID,
    title: "Research Feed",
    icon: "FlaskConical",
    Component: ResearchFeedSurface,
  });

  const removeSettings = registerHelperSettingsScreen(client, researchFeedSettings, {
    ui: { SettingsCard, SettingsSection, SettingsSwitch, SettingsSelect, SettingsInput },
    id: "research-feed-settings",
    title: "Research Feed",
    icon: "Settings",
    labels: {
      hfEnabled: "Hugging Face daily papers",
      hfEndpoint: "Hugging Face endpoint",
      arxivEnabled: "arXiv newest-by-category",
      arxivEndpoint: "arXiv Atom endpoint",
      arxivCategories: "arXiv categories (comma-separated)",
      openreviewEnabled: "OpenReview notes search",
      openreviewEndpoint: "OpenReview endpoint",
      openreviewTerms: "OpenReview terms (comma-separated)",
      lens: "Relevance lens",
      feedSize: "Feed size (cards per refresh)",
      eagerDigests: "Eager digests (top cards)",
      vendor: "Agent vendor (ACP)",
      agentTimeoutMs: "Agent timeout (ms)",
    },
  });

  // Command-center entry: opens the feed surface, which refetches on mount;
  // the surface's Refresh button triggers the full source fetch + ranking.
  const removeCommand = registerCommandCenterItem(client, {
    id: "research-feed",
    title: "Refresh research feed",
    icon: "FlaskConical",
    keywords: ["research", "feed", "papers", "arxiv", "refresh"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface(SURFACE_ID);
    },
  });

  return () => {
    removeCommand();
    removeSettings();
  };
}
