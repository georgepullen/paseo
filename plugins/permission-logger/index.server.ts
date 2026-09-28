import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createPluginLogger } from "paseo-plugin-helper/server";
import { permissionLoggerQuery } from "./shared/contracts.js";
import { PermissionLogStore } from "./server/storage.js";
import { createPermissionLogger, subscribePermissionEvents } from "./server/listener.js";

const log = createPluginLogger("permission-logger");

export default function contribute(server: PluginServerContext) {
  const store = new PermissionLogStore();
  const logger = createPermissionLogger({
    store,
    onRecord: (entry) => {
      log.info("permission decision logged", {
        id: entry.id,
        agentId: entry.agentId,
        name: entry.name,
        decision: entry.decision,
      });
    },
  });

  const unsubscribe = subscribePermissionEvents(
    server as unknown as Parameters<typeof subscribePermissionEvents>[0],
    logger,
  );

  server.handle(permissionLoggerQuery, (input) => store.query(input));

  log.info("permission-logger plugin contributed: audit log live", { path: store.filePath });

  return () => {
    unsubscribe();
  };
}
