import { usePluginTheme } from "paseo-plugin-helper/client";
import type { StatusVariant, ThemeColors } from "paseo-plugin-helper/shared";
import type { TypographyScale } from "paseo-plugin-helper/client";

export interface FleetTheme {
  colors: ThemeColors;
  alpha: (color: string, opacity: number) => string;
  getStatusColor: (variant: StatusVariant) => string;
  getVariantPalette: (variant: StatusVariant) => { bg: string; text: string; border: string };
  typography: TypographyScale;
}

/**
 * Fleet theme accessor backed by the host theme prop.
 *
 * Colors and color helpers come from the `client/` `PluginThemeProvider`
 * (which carries the host `theme` prop) — never from `getComputedStyle`
 * scraping. `ThemeColors` is a complete interface, so every `colors.x` read
 * is a defined string; the `colors.x ?? "#hex"` fallback chains this replaces
 * were dead code.
 */
export function useFleetTheme(): FleetTheme {
  const plugin = usePluginTheme();
  return {
    colors: plugin.colors,
    alpha: plugin.alpha,
    getStatusColor: plugin.getStatusColor,
    getVariantPalette: plugin.getVariantPalette,
    typography: plugin.typography,
  };
}
