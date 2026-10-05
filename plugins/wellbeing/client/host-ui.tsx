import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useHostTheme } from "paseo-plugin-helper/lifecycle";
import { resolveMetricStatus, type MetricThresholds } from "paseo-plugin-helper/shared";

/**
 * Local composition of the presentational pieces the wellbeing surface used to
 * import from the frozen `paseo-plugin-helper/client` kit (paseo#847, #937).
 *
 * The host SDK owns the design language; everything here is plain React Native
 * layout and host-theme color-token composition. Only the components this
 * plugin renders are composed — a shared kit is explicitly not wanted.
 */

// --- layout ----------------------------------------------------------------

const alignMap = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
} as const;

const justifyMap = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
} as const;

export interface HostRowProps {
  children: ReactNode;
  gap?: number;
  align?: keyof typeof alignMap;
  justify?: keyof typeof justifyMap;
  style?: StyleProp<ViewStyle>;
}

export function HostRow({
  children,
  gap = 8,
  align = "center",
  justify = "start",
  style,
}: HostRowProps) {
  return (
    <View
      style={[
        { flexDirection: "row", width: "100%" },
        { gap, alignItems: alignMap[align], justifyContent: justifyMap[justify] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface HostStackProps {
  children: ReactNode;
  gap?: number;
  align?: keyof typeof alignMap;
  justify?: keyof typeof justifyMap;
  style?: StyleProp<ViewStyle>;
}

export function HostStack({
  children,
  gap = 8,
  align = "stretch",
  justify = "start",
  style,
}: HostStackProps) {
  return (
    <View
      style={[
        { flexDirection: "column", width: "100%" },
        { gap, alignItems: alignMap[align], justifyContent: justifyMap[justify] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// --- button ----------------------------------------------------------------

export type HostButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type HostButtonSize = "sm" | "md" | "lg";

export interface HostButtonProps {
  label?: string;
  variant?: HostButtonVariant;
  size?: HostButtonSize;
  onPress?: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function HostButton({
  label,
  variant = "secondary",
  size = "md",
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
}: HostButtonProps) {
  const { colors, alpha } = useHostTheme();

  const py = size === "sm" ? 6 : size === "lg" ? 12 : 10;
  const px = size === "sm" ? 10 : size === "lg" ? 18 : 14;
  const fontSize = size === "sm" ? 12 : size === "lg" ? 15 : 13;

  let bg = "transparent";
  let border = "transparent";
  let textColor = colors.foreground;

  switch (variant) {
    case "primary":
      bg = colors.accent;
      textColor = colors.accentForeground;
      break;
    case "danger":
      bg = alpha(colors.statusDanger, 0.15);
      border = alpha(colors.statusDanger, 0.4);
      textColor = colors.statusDanger;
      break;
    case "ghost":
      textColor = colors.foregroundMuted;
      break;
    case "secondary":
    default:
      bg = colors.surface1;
      border = colors.border;
      textColor = colors.foreground;
      break;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      hitSlop={4}
      style={({ pressed }) => [
        {
          overflow: "hidden",
          backgroundColor: pressed && !disabled ? alpha(bg, 0.8) : bg,
          borderColor: border,
          borderWidth: border !== "transparent" ? 1 : 0,
          borderRadius: 10,
          paddingVertical: py,
          paddingHorizontal: px,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <Text style={[{ fontWeight: "600", textAlign: "center", color: textColor, fontSize }, textStyle]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// --- progress --------------------------------------------------------------

export interface HostProgressBarProps {
  value: number;
  color?: string;
  autoStatusColor?: boolean;
  thresholds?: MetricThresholds;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function HostProgressBar({
  value,
  color,
  autoStatusColor = true,
  thresholds,
  height = 8,
  style,
}: HostProgressBarProps) {
  const { colors } = useHostTheme();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  let barColor = color || colors.accent;
  if (!color && autoStatusColor) {
    const status = resolveMetricStatus(clamped, thresholds);
    barColor =
      status === "danger"
        ? colors.statusDanger
        : status === "warning"
          ? colors.statusWarning
          : colors.statusSuccess;
  }

  return (
    <View style={[{ width: "100%" }, style]}>
      <View
        style={{
          width: "100%",
          overflow: "hidden",
          backgroundColor: colors.surface2,
          height,
          borderRadius: height / 2,
        }}
      >
        <View
          style={{
            width: `${clamped}%`,
            height: "100%",
            backgroundColor: barColor,
            borderRadius: height / 2,
          }}
        />
      </View>
    </View>
  );
}
