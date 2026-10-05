import React, { type ComponentType, type ReactNode } from "react";
import type { PluginTheme } from "../shared/types.js";
import type { HostLayout } from "../client/host.js";
import type { VisualFlair } from "../client/theme/flair.js";
import { HostThemeProvider } from "./host-theme.js";

/**
 * Presentational seam for the lifecycle registration engines.
 *
 * The `client/` entry re-exports the registrars and installs a provider that
 * mounts the frozen `PluginThemeProvider` on top of the host theme, preserving
 * the legacy design-system behavior existing consumers depend on. Consumers
 * importing `paseo-plugin-helper/lifecycle` directly get only
 * `HostThemeProvider` (the host `theme` prop drives every ui/ adapter), which
 * is the migration target — no frozen `client/` theme or layout code is pulled.
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
 * Installed once by the `client/` compatibility shim. Keeping it out of the
 * `lifecycle/` entry's runtime imports is what lets that entry stay free of the
 * frozen design system.
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
