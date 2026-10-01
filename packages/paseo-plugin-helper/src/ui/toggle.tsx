import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useHostTheme } from "./theme.js";

export interface HostToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

/**
 * Host-delegating toggle for `paseo-plugin-helper/ui`.
 *
 * Thin wrapper around a `<Pressable>` switch that paints with host theme
 * colors. No scroll state machine, no width caps, no DOM scraping. Colors
 * come from `useHostTheme()` (provided by `HostThemeProvider`).
 */
export function HostToggle({
  value,
  onValueChange,
  label,
  description,
  disabled = false,
  style,
  labelStyle,
}: HostToggleProps) {
  const { colors } = useHostTheme();

  const handlePress = () => {
    if (!disabled) {
      onValueChange(!value);
    }
  };

  const trackColor = value ? colors.accent : colors.surface2;
  const thumbColor = value ? colors.accentForeground : colors.foregroundMuted;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={[styles.container, style]}
    >
      <View style={styles.track}>
        <View
          style={[
            styles.trackBackground,
            { backgroundColor: trackColor },
          ]}
        />
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: thumbColor,
              alignSelf: value ? "flex-end" : "flex-start",
            },
          ]}
        />
      </View>
      {label ? (
        <View style={styles.labelContainer}>
          <Text
            style={[
              styles.label,
              { color: disabled ? colors.foregroundMuted : colors.foreground },
              labelStyle,
            ]}
          >
            {label}
          </Text>
          {description ? (
            <Text style={[styles.description, { color: colors.foregroundMuted }]}>
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  track: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
  },
  trackBackground: {
    width: 44,
    height: 24,
    borderRadius: 12,
    position: "absolute",
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginHorizontal: 2,
  },
  labelContainer: {
    flexShrink: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  description: {
    fontSize: 12,
    marginTop: 2,
  },
});
