import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { PermissionAuditView } from "permission-audit/client";

export function PermissionLoggerSurface({ theme, layout }: PluginSurfaceProps) {
  return <PermissionAuditView variant="page" theme={theme} layout={layout} />;
}
