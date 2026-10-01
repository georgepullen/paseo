import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useHostTheme } from "./theme.js";

export type HostButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type HostButtonSize = "sm" | "md" | "lg";

export interface HostButtonProps {
  label?: string;
  children?: ReactNode;
  variant?: HostButtonVariant;
  size?: HostButtonSize;
  icon?: string | ReactNode;
  iconPosition?: "left" | "right";
  onPress?: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

/**
 * Host-delegating button for `paseo-plugin-helper/ui`.
 *
 * Thin wrapper around a `<Pressable>` that paints with host theme colors.
 * No scroll state machine, no width caps, no DOM scraping. Colors come from
 * `useHostTheme()` (provided by `HostThemeProvider`).
 */
export function HostButton({
  label,
  children,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
}: HostButtonProps) {
  const { colors, alpha } = useHostTheme();

  const fontSize = size === "sm" ? 12 : size === "lg" ? 16 : 14;
  const paddingVertical = size === "sm" ? 6 : size === "lg" ? 14 : 10;
  const paddingHorizontal = size === "sm" ? 12 : size === "lg" ? 24 : 16;

  let bg = colors.accent;
  let border = "transparent";
  let textColor = colors.accentForeground;

  if (variant === "secondary") {
    bg = colors.surface1;
    border = colors.border;
    textColor = colors.foreground;
  } else if (variant === "danger") {
    bg = colors.statusDanger;
    border = "transparent";
    textColor = "#ffffff";
  } else if (variant === "ghost") {
    bg = "transparent";
    border = "transparent";
    textColor = colors.foreground;
  }

  if (disabled || loading) {
    bg = alpha(bg, 0.5);
  }

  const renderIcon = () => {
    if (loading) {
      return <ActivityIndicator size="small" color={textColor} />;
    }
    if (!icon) return null;
    if (typeof icon === "string") {
      return null;
    }
    return icon;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          paddingVertical,
          paddingHorizontal,
          opacity: pressed && !disabled && !loading ? 0.8 : 1,
        },
        style,
      ]}
    >
      {iconPosition === "left" ? renderIcon() : null}
      {label ? (
        <Text
          style={[
            styles.text,
            { color: textColor, fontSize },
            textStyle,
          ]}
        >
          {label}
        </Text>
      ) : null}
      {children}
      {iconPosition === "right" ? renderIcon() : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  text: {
    fontWeight: "600",
  },
});
