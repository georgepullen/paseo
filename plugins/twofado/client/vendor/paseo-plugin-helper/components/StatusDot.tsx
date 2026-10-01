/**
 * @deprecated The `client/` bespoke UI kit is deprecated (paseo#847) and
 * frozen: no new features, bug fixes only. Migrate to the `ui/` adapter layer
 * (`paseo-plugin-helper/ui`) composed with host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { usePluginTheme } from "../theme/provider";
import type { StatusVariant } from "../../../../shared/vendor/paseo-plugin-helper/types";

export interface StatusDotProps {
  variant?: StatusVariant;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * @deprecated Deprecated bespoke UI kit (paseo#847): frozen, bug fixes only.
 * Migrate to `paseo-plugin-helper/ui` + host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */
export function StatusDot({ variant = "neutral", size = "md", pulse = false, style }: StatusDotProps) {
  const { getStatusColor, alpha } = usePluginTheme();
  const color = getStatusColor(variant);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [pulse, pulseAnim]);

  const dimension = size === "sm" ? 6 : size === "lg" ? 10 : 8;

  return (
    <View
      style={[
        styles.container,
        {
          width: dimension,
          height: dimension,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.dot,
          {
            width: dimension,
            height: dimension,
            borderRadius: dimension / 2,
            backgroundColor: color,
            shadowColor: color,
            opacity: pulseAnim,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
});
