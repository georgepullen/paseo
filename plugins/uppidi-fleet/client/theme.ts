import { useHostTheme } from "paseo-plugin-helper/ui";
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
 * Fleet theme accessor backed by the `ui/` HostThemeProvider.
 *
 * Colors come from `useHostTheme()` (the host `theme` prop carried by
 * `HostThemeProvider`) — never from `getComputedStyle` scraping and never
 * from a deprecated `client/` provider. `ThemeColors` is a complete
 * interface, so every `colors.x` read is a defined string; the
 * `colors.x ?? "#hex"` fallback chains this replaces were dead code.
 *
 * Typography still comes from the frozen `client/` `PluginThemeProvider`
 * because the `ui/` adapter layer does not carry a typography scale yet.
 * When it does, this hook drops the second read.
 */
export function useFleetTheme(): FleetTheme {
  const host = useHostTheme();
  const plugin = usePluginTheme();
  return {
    colors: host.colors,
    alpha: host.alpha,
    getStatusColor: host.getStatusColor,
    getVariantPalette: host.getVariantPalette,
    typography: plugin.typography,
  };
}
