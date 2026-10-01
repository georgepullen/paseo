import React, { type Ref } from "react";
import {
  FlatList as FallbackFlatList,
  StyleSheet,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { getOptionalClientHost } from "../client/host.js";

/**
 * Host-delegating flat list for `paseo-plugin-helper/ui`.
 *
 * Thin wrapper that delegates to the host-injected FlatList (sheet-gesture
 * integrated on Paseo v0.8) and falls back to plain React Native FlatList.
 * No scroll ownership state machine — the caller decides where to render
 * this; it never nests itself inside another scroller.
 */
export function HostFlatList<ItemT>({
  style,
  contentContainerStyle,
  ...props
}: FlatListProps<ItemT> & {
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  ref?: Ref<unknown>;
}) {
  const ResolvedFlatList = getOptionalClientHost()?.FlatList ?? FallbackFlatList;
  return (
    <ResolvedFlatList
      {...(props as FlatListProps<ItemT>)}
      style={[styles.fluid, style]}
      contentContainerStyle={contentContainerStyle}
    />
  );
}

const styles = StyleSheet.create({
  fluid: {
    width: "100%",
  },
});
