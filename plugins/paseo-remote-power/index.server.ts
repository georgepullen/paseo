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
  type HostRecord,
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
import { readSettings, engineSettingsFrom } from "./server/settings";
import { createWakeEngine } from "./server/wake-engine";
import { syncInferenceProxies, stopInferenceProxies } from "./server/inference-proxy";
import { createAgentHoldTracker, type PaseoAgentsLike } from "./server/agent-hold";

/**
 * paseo-remote-power server contribution: roster RPCs (hosts, wake jobs,
 * settings) plus `agent.create` injection of the embedded power MCP server, so
 * every agent the daemon spawns — interactive or scheduled — can wake a host
 * before running work on it. Also supervises the per-host inference proxies
 * and the agent keep-awake hold tracker (plugin-server-only features).
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

  const wakeEngine = createWakeEngine({ settings: () => engineSettingsFrom(readSettings()) });
  const startWake = (host: HostRecord) => wakeEngine.startWake(host);
  const holdTracker = createAgentHoldTracker({ startWake });

  void syncInferenceProxies({ startWake });

  const removeTurnStarted = server.on("agent.turn_started", (event, ctx) => {
    void holdTracker.turnStarted(event.agent.id, ctx.paseo as unknown as PaseoAgentsLike);
  });
  const removeTurnEnded = server.on("agent.turn_ended", (event) => {
    holdTracker.turnEnded(event.agent.id);
  });

  const removeInjection = maybeRegisterInjection(toInjectionServer(server), {
    enabled: readSettings().agentInjectionEnabled,
  });

  return () => {
    if (typeof removeTurnStarted === "function") removeTurnStarted();
    if (typeof removeTurnEnded === "function") removeTurnEnded();
    holdTracker.stop();
    void stopInferenceProxies();
    removeInjection();
  };
}
