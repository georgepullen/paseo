/**
 * @deprecated The `client/` bespoke UI kit is deprecated (paseo#847) and
 * frozen: no new features, bug fixes only. Migrate to the `ui/` adapter layer
 * (`paseo-plugin-helper/ui`) composed with host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */
import React from "react";
import { Image, Platform, type ImageStyle, type StyleProp } from "react-native";
import { Icon } from "./icon";
import { usePluginTheme } from "./theme/provider";
import {
  forgeMarkSource,
  resolveForgeMark,
  type ForgeMarkInput,
} from "../../../shared/vendor/paseo-plugin-helper/forge";

export interface ForgeIconProps extends ForgeMarkInput {
  /** Icon box in points; defaults to 16 to match the host Lucide default. */
  size?: number;
  /** Mark color; defaults to the active theme foreground. */
  color?: string;
  style?: StyleProp<ImageStyle>;
  /** Overrides the default forge-name accessibility label. */
  accessibilityLabel?: string;
}

/**
 * Shared forge brand mark. Resolves a host/kind to one mark and renders it:
 * GitHub/GitLab/unknown delegate to the host Lucide set, while Codeberg,
 * Forgejo and Gitea draw their official mono marks inline. On native, where
 * Paseo plugin bundles cannot render SVG, custom marks fall back to their
 * closest Lucide glyph so forges stay distinct.
 */
export function ForgeIcon({
  host,
  kind,
  size = 16,
  color,
  style,
  accessibilityLabel,
}: ForgeIconProps) {
  const { colors } = usePluginTheme();
  const markColor = color ?? colors.foreground;
  const mark = resolveForgeMark({ host, kind });
  const source = mark.custom && Platform.OS === "web" ? forgeMarkSource(mark.kind, markColor) : null;

  if (!source) {
    return <Icon name={mark.lucideName} size={size} color={markColor} />;
  }

  return (
    <Image
      accessibilityLabel={accessibilityLabel ?? mark.label}
      accessibilityRole="image"
      accessible
      source={source}
      style={[{ width: size, height: size }, style]}
    />
  );
}
