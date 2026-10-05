import React, { type ComponentType, type ReactNode } from "react";
import type { PluginTheme } from "../shared/types.js";
import type { HostLayout } from "../core/host.js";
import type { VisualFlair } from "./flair.js";
import { HostThemeProvider } from "./host-theme.js";

/**
 * Presentational seam for the lifecycle registration engines.
 *
 * The bespoke `client/` design system was removed (#938), so no installer
 * remains: `RegistrarThemeScope` mounts only `HostThemeProvider` (the host
 * `theme` prop drives every ui/ adapter). The legacy-provider hook stays for
 * callers that mounted their own theme provider before the removal.
 */
export interface RegistrarThemeProps {
  theme: PluginTheme;
  layout?: HostLayout;
  flair?: Partial<VisualFlair>;
  children: ReactNode;
}

export type RegistrarLegacyThemeProvider = ComponentType<RegistrarThemeProps>;

let legacyThemeProvider: RegistrarLegacyThemeProvider | undefined;

/**
 * Installed once by a legacy theme shim. Keeping it out of the `lifecycle/`
 * entry's runtime imports is what lets that entry stay free of any UI kit.
 */
export function setRegistrarLegacyThemeProvider(
  provider: RegistrarLegacyThemeProvider | undefined,
): void {
  legacyThemeProvider = provider;
}

/** Mounts the host theme (always) and the legacy provider (when installed). */
export function RegistrarThemeScope({ theme, layout, flair, children }: RegistrarThemeProps) {
  const hostTheme = <HostThemeProvider theme={theme}>{children}</HostThemeProvider>;
  const Legacy = legacyThemeProvider;
  if (!Legacy) return hostTheme;
  return (
    <Legacy theme={theme} layout={layout} flair={flair}>
      {hostTheme}
    </Legacy>
  );
}
