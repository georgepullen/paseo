import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import {
  Icon,
  Modal,
  useToast,
  ScrollView,
  FlatList,
  TextInput as HostTextInput,
  copyText,
} from "@getpaseo/plugin/client/react-native";
import { initClientHelpers } from "paseo-plugin-helper/core";
import { registerSidebarSurface } from "paseo-plugin-helper/lifecycle";
import { WellbeingSurface } from "./client/surface.js";

initClientHelpers({
  Icon,
  Modal,
  useRpc,
  useToast,
  copyText,
  ScrollView,
  FlatList,
  TextInput: HostTextInput,
});

export default function contribute(client: PluginClientContext) {
  return registerSidebarSurface(client, {
    id: "wellbeing",
    title: "Wellbeing",
    icon: "Heart",
    Component: WellbeingSurface,
  });
}
