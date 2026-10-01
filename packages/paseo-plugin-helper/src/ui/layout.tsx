import React, { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useHostTheme } from "./theme.js";

/** Static spacing scale (px). The host owns the design language; this is just layout. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export type SpacingValue = keyof typeof spacing | number;

export function resolveSpacing(value: SpacingValue | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "number") return value;
  return spacing[value] ?? fallback;
}

export interface HostRowProps {
  children: ReactNode;
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Host-delegating horizontal row for `paseo-plugin-helper/ui`.
 *
 * Colors come from `useHostTheme()` (provided by `HostThemeProvider`) — no
 * theme scraping.
 */
export function HostRow({
  children,
  gap = 8,
  align = "center",
  justify = "start",
  wrap = false,
  style,
}: HostRowProps) {
  return (
    <View
      style={[
        styles.row,
        {
          gap,
          alignItems: alignMap[align],
          justifyContent: justifyMap[justify],
          flexWrap: wrap ? "wrap" : "nowrap",
        },
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
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  grow?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Host-delegating vertical stack for `paseo-plugin-helper/ui`.
 *
 * Colors come from `useHostTheme()` (provided by `HostThemeProvider`) — no
 * theme scraping.
 */
export function HostStack({
  children,
  gap = 8,
  align = "stretch",
  justify = "start",
  grow = false,
  style,
}: HostStackProps) {
  return (
    <View
      style={[
        styles.stack,
        {
          gap,
          alignItems: alignMap[align],
          justifyContent: justifyMap[justify],
          ...(grow ? { flex: 1, minHeight: 0 } : null),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface HostGridProps {
  children: ReactNode;
  columns?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Host-delegating wrapping grid for `paseo-plugin-helper/ui`.
 *
 * Colors come from `useHostTheme()` (provided by `HostThemeProvider`) — no
 * theme scraping.
 */
export function HostGrid({
  children,
  columns = 2,
  gap = 8,
  style,
}: HostGridProps) {
  return (
    <View style={[styles.grid, { gap }, style]}>
      {React.Children.map(children, (child) => (
        <View style={{ flexBasis: `${100 / columns}%`, flexGrow: 0, flexShrink: 1, minWidth: 0 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export interface HostActionBarProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Host-delegating action bar for `paseo-plugin-helper/ui`.
 *
 * Colors come from `useHostTheme()` (provided by `HostThemeProvider`) — no
 * theme scraping.
 */
export function HostActionBar({
  children,
  style,
}: HostActionBarProps) {
  return (
    <View style={[styles.actionBar, style]}>
      {children}
    </View>
  );
}

export interface HostFormRowProps {
  label: string;
  description?: string;
  children: ReactNode;
  layout?: "stacked" | "inline";
  style?: StyleProp<ViewStyle>;
}

/**
 * Host-delegating form row for `paseo-plugin-helper/ui`.
 *
 * Colors come from `useHostTheme()` (provided by `HostThemeProvider`) — no
 * theme scraping.
 */
export function HostFormRow({
  label,
  description,
  children,
  layout = "stacked",
  style,
}: HostFormRowProps) {
  const { colors } = useHostTheme();

  return (
    <View
      style={[
        styles.formRow,
        layout === "inline" ? styles.formRowInline : styles.formRowStacked,
        style,
      ]}
    >
      <View style={styles.formLabel}>
        <Text style={[styles.formLabelText, { color: colors.foreground }]}>{label}</Text>
        {description ? (
          <Text style={[styles.formDescription, { color: colors.foregroundMuted }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.formControl}>{children}</View>
    </View>
  );
}

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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    width: "100%",
  },
  stack: {
    flexDirection: "column",
    width: "100%",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
  },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    width: "100%",
    flexWrap: "wrap",
  },
  formRow: {
    gap: 4,
    width: "100%",
  },
  formRowStacked: {
    flexDirection: "column",
  },
  formRowInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  formLabel: {
    gap: 2,
    flexShrink: 1,
  },
  formLabelText: {
    fontSize: 13,
    fontWeight: "600",
  },
  formDescription: {
    fontSize: 11,
  },
  formControl: {
    flexShrink: 1,
    minWidth: 0,
  },
});
