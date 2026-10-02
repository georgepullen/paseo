import React, { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { getClientHost } from "../host";
import { useHostTheme } from "./theme";

export interface HostEmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Host-delegating empty state for `paseo-plugin-helper/ui`.
 *
 * Colors come from `useHostTheme()` (provided by `HostThemeProvider`) — no
 * theme scraping.
 */
export function HostEmptyState({
  icon,
  title,
  description,
  action,
  style,
}: HostEmptyStateProps) {
  const { Icon } = getClientHost();
  const { colors } = useHostTheme();

  return (
    <View style={[styles.container, style]}>
      {icon ? <Icon name={icon} size={32} color={colors.foregroundMuted} /> : null}
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.foregroundMuted }]}>
          {description}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 32,
    paddingHorizontal: 16,
    width: "100%",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  description: {
    fontSize: 12,
    textAlign: "center",
    flexShrink: 1,
  },
});
