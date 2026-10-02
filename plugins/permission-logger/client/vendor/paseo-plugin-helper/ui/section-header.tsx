import React, { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useHostTheme } from "./theme";

export interface HostSectionHeaderProps {
  title: string;
  count?: number;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Host-delegating section header for `paseo-plugin-helper/ui`.
 *
 * Colors come from `useHostTheme()` (provided by `HostThemeProvider`) — no
 * theme scraping.
 */
export function HostSectionHeader({
  title,
  count,
  action,
  style,
}: HostSectionHeaderProps) {
  const { colors } = useHostTheme();

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {count !== undefined ? (
        <View style={[styles.countBadge, { backgroundColor: colors.surface2 }]}>
          <Text style={[styles.countText, { color: colors.foregroundMuted }]}>
            {count}
          </Text>
        </View>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  countBadge: {
    borderRadius: 9999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: 10,
    fontWeight: "600",
  },
});
