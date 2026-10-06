import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  hostStatusRpc,
  hostWakeRpc,
  hostsAddRpc,
  hostsListRpc,
  hostsRemoveRpc,
  hostsUpdateRpc,
  jobStatusRpc,
  jobsListRpc,
  powerSettingsContract,
} from "./shared/registry";
import {
  handleGetSettings,
  handleHostStatus,
  handleHostWake,
  handleHostsAdd,
  handleHostsList,
  handleHostsRemove,
  handleHostsUpdate,
  handleJobStatus,
  handleJobsList,
  handleResetSettings,
  handleUpdateSettings,
} from "./server/handlers";
import { maybeRegisterInjection, toInjectionServer } from "./server/injection";
import { readSettings } from "./server/settings";

/**
 * paseo-remote-power server contribution: roster RPCs (hosts, wake jobs,
 * settings) plus `agent.create` injection of the embedded power MCP server, so
 * every agent the daemon spawns — interactive or scheduled — can wake a host
 * before running work on it.
 */
export default function contribute(server: PluginServerContext) {
  server.handle(hostsListRpc, handleHostsList);
  server.handle(hostsAddRpc, handleHostsAdd);
  server.handle(hostsUpdateRpc, handleHostsUpdate);
  server.handle(hostsRemoveRpc, handleHostsRemove);
  server.handle(hostStatusRpc, handleHostStatus);
  server.handle(hostWakeRpc, handleHostWake);
  server.handle(jobStatusRpc, handleJobStatus);
  server.handle(jobsListRpc, handleJobsList);
  server.handle(powerSettingsContract.get, handleGetSettings);
  server.handle(powerSettingsContract.update, handleUpdateSettings);
  server.handle(powerSettingsContract.reset, handleResetSettings);

  const removeInjection = maybeRegisterInjection(toInjectionServer(server), {
    enabled: readSettings().agentInjectionEnabled,
  });

  return () => {
    removeInjection();
  };
}
