import React from "react";
import type {
  PluginClientContext,
  PluginSurfaceProps,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { ModalBodyScrollOwnerContext } from "paseo-plugin-helper/lifecycle";
import { HostThemeProvider } from "./theme.js";
import { UppidiFleetSurface } from "./surface.js";

export function UppidiFleetPanel(props: PluginWorkspacePanelProps) {
  return (
    <HostThemeProvider theme={props.theme}>
      <ModalBodyScrollOwnerContext.Provider value="required">
        <UppidiFleetSurface {...props} />
      </ModalBodyScrollOwnerContext.Provider>
    </HostThemeProvider>
  );
}

export const UppidiForgePanel = UppidiFleetPanel;

/**
 * Sidebar surface entry. `registerSidebarSurface` no longer installs the
 * frozen client theme provider, so the surface carries the host theme itself.
 */
export function UppidiFleetSidebar(props: PluginSurfaceProps) {
  return (
    <HostThemeProvider theme={props.theme}>
      <UppidiFleetSurface {...props} />
    </HostThemeProvider>
  );
}

export {
  UppidiFleetPanel as UppidiFleetWorkspacePanel,
  UppidiForgePanel as UppidiForgeWorkspacePanel,
};

export function registerWorkspacePanel(client: PluginClientContext) {
  return client.addWorkspacePanel({
    id: "uppidi-fleet",
    title: "Uppidi Fleet",
    icon: "GitPullRequest",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: UppidiFleetPanel,
  });
}
