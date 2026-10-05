import { type PluginAgentPanelProps } from "@getpaseo/plugin/client";
import { CrossDaemonConversation } from "./x-comms-conversation";
import { HostThemeProvider } from "./host-ui";

export function CrossDaemonPanel({ theme, agentId }: PluginAgentPanelProps) {
  return (
    <HostThemeProvider theme={theme}>
      <CrossDaemonConversation theme={theme} agentId={agentId} />
    </HostThemeProvider>
  );
}
