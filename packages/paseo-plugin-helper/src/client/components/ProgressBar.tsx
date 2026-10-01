/**
 * @deprecated The `client/` bespoke UI kit is deprecated (paseo#847) and
 * frozen: no new features, bug fixes only. Migrate to the `ui/` adapter layer
 * (`paseo-plugin-helper/ui`) composed with host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { usePluginTheme } from "../theme/provider.js";
import { resolveMetricStatus, type MetricThresholds } from "../../shared/formatters.js";

export interface ProgressBarProps {
  value: number; // 0 to 100
  color?: string;
  autoStatusColor?: boolean;
  thresholds?: MetricThresholds;
  label?: string;
  showValueText?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * @deprecated Deprecated bespoke UI kit (paseo#847): frozen, bug fixes only.
 * Migrate to `paseo-plugin-helper/ui` + host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */
export function ProgressBar({
  value,
  color,
  autoStatusColor = true,
  thresholds,
  label,
  showValueText = false,
  height = 8,
  style,
}: ProgressBarProps) {
  const { colors, resolveRadius, typography } = usePluginTheme();

  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = resolveRadius("pill");

  let barColor = color || colors.accent;
  if (!color && autoStatusColor) {
    const status = resolveMetricStatus(clamped, thresholds);
    if (status === "danger") {
      barColor = colors.statusDanger;
    } else if (status === "warning") {
      barColor = colors.statusWarning;
    } else {
      barColor = colors.statusSuccess;
    }
  }

  return (
    <View style={[styles.container, style]}>
      {(label || showValueText) && (
        <View style={styles.labelRow}>
          {label ? (
            <Text
              style={[
                styles.labelText,
                { color: colors.foregroundMuted, ...typography.caption },
              ]}
            >
              {label}
            </Text>
          ) : null}
          {showValueText ? (
            <Text
              style={[
                styles.valueText,
                { color: colors.foreground, ...typography.caption, fontWeight: "600" },
              ]}
            >
              {Math.round(clamped)}%
            </Text>
          ) : null}
        </View>
      )}
      <View
        style={[
          styles.track,
          {
            backgroundColor: colors.surface2,
            height,
            borderRadius: radius,
          },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${clamped}%`,
              backgroundColor: barColor,
              borderRadius: radius,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  labelText: {
    fontWeight: "500",
  },
  valueText: {
    fontWeight: "600",
  },
  track: {
    width: "100%",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
});
