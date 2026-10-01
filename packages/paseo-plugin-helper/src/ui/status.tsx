import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useHostTheme } from "./theme.js";
import type { StatusVariant } from "../shared/types.js";

export interface HostStatusDotProps {
  variant?: StatusVariant;
  size?: number;
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Host-delegating status dot for `paseo-plugin-helper/ui`.
 *
 * Colors come from `useHostTheme()` (provided by `HostThemeProvider`) — no
 * theme scraping.
 */
export function HostStatusDot({
  variant = "neutral",
  size = 8,
  pulse = false,
  style,
}: HostStatusDotProps) {
  const { colors } = useHostTheme();
  const color = resolveStatusColor(variant, colors);

  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        pulse && styles.pulse,
        style,
      ]}
    />
  );
}

function resolveStatusColor(variant: StatusVariant, colors: ReturnType<typeof useHostTheme>["colors"]): string {
  switch (variant) {
    case "success":
      return colors.statusSuccess;
    case "warning":
      return colors.statusWarning;
    case "danger":
      return colors.statusDanger;
    case "accent":
      return colors.accent;
    case "info":
      return colors.accent;
    case "neutral":
    default:
      return colors.foregroundMuted;
  }
}

const styles = StyleSheet.create({
  dot: {
    flexShrink: 0,
  },
  pulse: {
    opacity: 0.7,
  },
});
