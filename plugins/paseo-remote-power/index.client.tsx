import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, useToast, ScrollView, FlatList, TextInput as HostTextInput, copyText } from "@getpaseo/plugin/client/react-native";
import { SettingsCard, SettingsInput, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { initClientHelpers, registerCommandCenterItem } from "paseo-plugin-helper/core";
import { registerSidebarSurface } from "paseo-plugin-helper/lifecycle";
import { registerHelperSettingsScreen } from "paseo-plugin-helper/ui";
import { PowerSurface } from "./client/surface";
import { powerSettingsContract } from "./shared/registry";

initClientHelpers({ Icon, Modal, useRpc, useToast, copyText, ScrollView, FlatList, TextInput: HostTextInput });

/**
 * paseo-remote-power client contribution: the hosts roster surface (status
 * dots, wake buttons with live job progress, add/edit/remove forms, jobs list)
 * plus a settings screen rendered from the shared settings contract.
 */
export default function contribute(client: PluginClientContext) {
  const removeSettings = registerHelperSettingsScreen(client, powerSettingsContract, {
    ui: { SettingsCard, SettingsSection, SettingsSwitch, SettingsSelect, SettingsInput },
    id: "paseo-remote-power-settings",
    title: "Remote power",
    icon: "Power",
  });

  // registerSidebarSurface injects <HostThemeProvider> so the helper
  // primitives resolve the host theme/layout (compact + mobile).
  const removeSurface = registerSidebarSurface(client, {
    id: "remote-power",
    title: "Remote power",
    icon: "Power",
    Component: PowerSurface,
  });

  const removeCommand = registerCommandCenterItem(client, {
    id: "open-remote-power",
    title: "Open remote power",
    icon: "Power",
    keywords: ["power", "wake", "wol", "hosts", "remote"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("remote-power");
    },
  });

  return () => {
    removeCommand();
    removeSurface();
    removeSettings();
  };
}
