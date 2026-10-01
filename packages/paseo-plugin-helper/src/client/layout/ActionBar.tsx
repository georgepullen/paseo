/**
 * @deprecated The `client/` bespoke UI kit is deprecated (paseo#847) and
 * frozen: no new features, bug fixes only. Migrate to the `ui/` adapter layer
 * (`paseo-plugin-helper/ui`) composed with host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */
import React, { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { usePluginTheme } from "../theme/provider.js";

export interface ActionBarProps {
  children: ReactNode;
  align?: "flex-start" | "flex-end" | "center" | "space-between";
  direction?: "row" | "column" | "auto";
  style?: StyleProp<ViewStyle>;
}

/**
 * Responsive action toolbar for modals and surfaces.
 * Automatically wraps or stacks on compact/mobile layouts.
 */
export function ActionBar({
  children,
  align = "flex-end",
  direction = "auto",
  style,
}: ActionBarProps) {
  const { isCompact, padding } = usePluginTheme();

  const isColumn = direction === "column" || (direction === "auto" && isCompact);

  return (
    <View
      style={[
        styles.container,
        {
          flexDirection: isColumn ? "column" : "row",
          justifyContent: isColumn ? "flex-start" : align,
          alignItems: isColumn ? "stretch" : "center",
          gap: isCompact ? 8 : 10,
          marginTop: padding.vertical,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexWrap: "wrap",
  },
});
