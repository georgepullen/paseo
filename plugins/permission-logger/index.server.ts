import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createPluginLogger } from "paseo-plugin-helper/server";
import { registerPermissionAuditServer } from "permission-audit/server";

const log = createPluginLogger("permission-logger");

export default function contribute(server: PluginServerContext) {
  const { store, unsubscribe } = registerPermissionAuditServer(
    server as unknown as Parameters<typeof registerPermissionAuditServer>[0],
    { logger: log },
  );

  log.info("permission-logger plugin contributed: audit log live", { path: store.filePath });

  return () => {
    unsubscribe();
  };
}
