import React, { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { getClientHost } from "../host";
import { useHostTheme } from "./theme";

export interface HostCardProps {
  children: ReactNode;
  variant?: "default" | "tinted" | "elevated";
  style?: StyleProp<ViewStyle>;
  noPadding?: boolean;
}

export interface HostCardHeaderProps {
  title: string;
  subtitle?: string;
  value?: string | number | ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
}

/**
 * Host-delegating card surface for `paseo-plugin-helper/ui`.
 *
 * Thin wrapper around a `<View>` that paints with host theme colors. No
 * scroll state machine, no width caps, no DOM scraping. Colors come from
 * `useHostTheme()` (provided by `HostThemeProvider`).
 */
export function HostCard({ children, variant, style, noPadding = false }: HostCardProps) {
  const { colors, alpha } = useHostTheme();

  let bg = colors.surface0;
  let border = colors.border;

  if (variant === "tinted") {
    bg = alpha(colors.accent, 0.04);
    border = alpha(colors.accent, 0.2);
  } else if (variant === "elevated") {
    bg = colors.surface1;
    border = colors.border;
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor: border,
          paddingHorizontal: noPadding ? 0 : 16,
          paddingVertical: noPadding ? 0 : 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Card header with title, subtitle, value, badge, action, and icon.
 * Uses host theme colors via `useHostTheme()`.
 */
export function HostCardHeader({
  title,
  subtitle,
  value,
  badge,
  action,
  icon,
  style,
  titleStyle,
  subtitleStyle,
}: HostCardHeaderProps) {
  const { Icon } = getClientHost();
  const { colors } = useHostTheme();

  return (
    <View style={[styles.headerContainer, style]}>
      <View style={styles.headerLeft}>
        {icon ? <Icon name={icon} size={15} color={colors.foregroundMuted} /> : null}
        <View style={styles.titleColumn}>
          <Text
            style={[
              styles.headerTitle,
              { color: colors.foreground },
              titleStyle,
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.headerSubtitle,
                { color: colors.foregroundMuted },
                subtitleStyle,
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.headerRight}>
        {badge ? <View style={{ marginRight: 6 }}>{badge}</View> : null}
        {typeof value === "string" || typeof value === "number" ? (
          <Text
            style={[
              styles.headerValue,
              { color: colors.foreground },
            ]}
          >
            {value}
          </Text>
        ) : (
          value
        )}
        {action}
      </View>
    </View>
  );
}

HostCard.Header = HostCardHeader;

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  titleColumn: {
    gap: 1,
    flexShrink: 1,
  },
  headerTitle: {
    fontWeight: "600",
    fontSize: 14,
  },
  headerSubtitle: {
    fontWeight: "400",
    fontSize: 12,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  headerValue: {
    fontWeight: "600",
    fontSize: 14,
  },
});
