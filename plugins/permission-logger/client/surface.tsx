import type { HostSurfaceProps } from "paseo-plugin-helper/client";
import { PermissionAuditView } from "permission-audit/client";

export function PermissionLoggerSurface({ theme, layout }: HostSurfaceProps) {
  return <PermissionAuditView variant="page" theme={theme} layout={layout} />;
}
