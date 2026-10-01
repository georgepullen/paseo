import React, { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { getClientHost } from "../client/host.js";
import { useHostTheme } from "./theme.js";
import type { StatusVariant } from "../shared/types.js";

export type HostBadgeStyle = "tinted" | "outline" | "solid";
export type HostBadgeSize = "sm" | "md";

export interface HostBadgeProps {
  label: string;
  variant?: StatusVariant;
  styleVariant?: HostBadgeStyle;
  size?: HostBadgeSize;
  icon?: string | ReactNode;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * Host-delegating badge for `paseo-plugin-helper/ui`.
 *
 * Thin wrapper that paints a small label with host theme colors. No scroll
 * state machine, no width caps, no DOM scraping. Colors come from
 * `useHostTheme()` (provided by `HostThemeProvider`).
 */
export function HostBadge({
  label,
  variant = "neutral",
  styleVariant = "tinted",
  size = "md",
  icon,
  dot = false,
  style,
  textStyle,
}: HostBadgeProps) {
  const { Icon } = getClientHost();
  const { colors, getStatusColor, getVariantPalette } = useHostTheme();

  const fontSize = size === "sm" ? 10 : 11;
  const lineHeight = size === "sm" ? 12 : 15;
  const paddingVertical = size === "sm" ? 1 : 2;
  const paddingHorizontal = size === "sm" ? 5 : 8;
  const iconSize = size === "sm" ? 10 : 11;

  const baseColor = getStatusColor(variant);
  const palette = getVariantPalette(variant);

  let bg = palette.bg;
  let border = palette.border;
  let textColor = palette.text;

  if (styleVariant === "outline") {
    bg = "transparent";
    border = palette.border;
    textColor = palette.text;
  } else if (styleVariant === "solid") {
    bg = baseColor;
    border = "transparent";
    textColor = colors.accentForeground;
  }

  const renderIcon = () => {
    if (dot) {
      return (
        <View
          style={[
            styles.dot,
            { backgroundColor: textColor },
          ]}
        />
      );
    }
    if (!icon) return null;
    if (typeof icon === "string") {
      return <Icon name={icon} size={iconSize} color={textColor} />;
    }
    return icon;
  };

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          borderColor: border,
          paddingVertical,
          paddingHorizontal,
        },
        style,
      ]}
    >
      {renderIcon()}
      <Text
        accessibilityLabel={label}
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[
          styles.text,
          {
            color: textColor,
            fontSize,
            lineHeight,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 9999,
    gap: 4,
    flexShrink: 1,
    maxWidth: "100%",
  },
  text: {
    fontWeight: "600",
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
