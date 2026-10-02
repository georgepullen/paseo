import React, { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { getClientHost } from "../host";
import { useHostTheme } from "./theme";

export interface HostKeyValueProps {
  label: string;
  value: ReactNode;
  layout?: "stacked" | "inline";
  mono?: boolean;
  copyable?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Host-delegating key-value display for `paseo-plugin-helper/ui`.
 *
 * Colors come from `useHostTheme()` (provided by `HostThemeProvider`) — no
 * theme scraping.
 */
export function HostKeyValue({
  label,
  value,
  layout = "stacked",
  mono = false,
  copyable = false,
  style,
}: HostKeyValueProps) {
  const { Icon, useToast } = getClientHost();
  const { colors } = useHostTheme();

  const handleCopy = () => {
    if (typeof value === "string") {
      useToast()?.copied?.(label);
    }
  };

  return (
    <View
      style={[
        styles.container,
        layout === "inline" ? styles.inline : styles.stacked,
        style,
      ]}
    >
      <Text style={[styles.label, { color: colors.foregroundMuted }]}>{label}</Text>
      <View style={styles.valueRow}>
        <Text
          numberOfLines={1}
          style={[
            styles.value,
            { color: colors.foreground },
            mono && styles.mono,
          ]}
        >
          {value}
        </Text>
        {copyable && typeof value === "string" ? (
          <Icon name="copy" size={12} color={colors.foregroundMuted} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
  },
  stacked: {
    flexDirection: "column",
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  value: {
    fontSize: 13,
    flexShrink: 1,
  },
  mono: {
    fontFamily: "monospace",
  },
});
