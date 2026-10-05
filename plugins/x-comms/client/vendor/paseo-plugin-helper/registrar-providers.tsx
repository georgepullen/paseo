import React from "react";
import {
  setRegistrarLegacyThemeProvider,
  type RegistrarThemeProps,
} from "./lifecycle/providers";
import { PluginThemeProvider } from "./theme/provider";

/**
 * Compatibility seam: the `client/` entry installs the frozen
 * `PluginThemeProvider` on the lifecycle registrars so existing consumers keep
 * their current theme context. The `lifecycle/` entry alone stays free of the
 * frozen design system.
 */
function ClientLegacyThemeProvider({ theme, layout, flair, children }: RegistrarThemeProps) {
  return (
    <PluginThemeProvider theme={theme} layout={layout} flair={flair}>
      {children}
    </PluginThemeProvider>
  );
}

setRegistrarLegacyThemeProvider(ClientLegacyThemeProvider);
