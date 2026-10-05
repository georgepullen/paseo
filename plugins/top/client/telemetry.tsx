import React, { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useAgent, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import {
  HostBadge,
  HostCollapsible,
  HostCopyButton,
  HostProgressBar,
  HostRow,
  HostStack,
  HostThemeProvider,
  getStatusColor,
} from "./host-ui";
import { usePluginSettings } from "paseo-plugin-helper/client";
import {
  formatBytes,
  formatUptime,
  resolveMetricStatus,
  truncatePath,
} from "paseo-plugin-helper/shared";
import { buildTelemetryCopyText } from "./telemetry-copy";
import {
  isTimelineEnabled,
  isMcpSurfaceEnabled,
  topSettingsContract,
  TIMELINE_RENDERED_METRICS,
  CPU_THRESHOLDS,
  MEM_THRESHOLDS,
  type MetricId,
  type TopTimelineTelemetryData,
} from "../shared/resources";
import { formatCompactTokens, type TopAgentSnapshot } from "./pill-labels";

export { TIMELINE_RENDERED_METRICS };

function Vital({
  icon,
  color,
  children,
}: {
  icon: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <HostRow gap={4} align="center">
      <Icon name={icon} size={12} color={color} />
      {/*
       * Color MUST be applied to the label as well as the icon. A <Text> with
       * no `color` falls back to React Native's default black and disappears on
       * dark surfaces (xpufx-org/paseo#208). Reusing the icon's `color` keeps
       * threshold states (e.g. CPU/RAM warning/danger) consistent for both.
       */}
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "500", color }}>
        {children}
      </Text>
    </HostRow>
  );
}

export function TopTimelineTelemetryCard({
  item,
  theme,
  layout,
  timestamp,
}: PluginTimelineItemProps<TopTimelineTelemetryData>) {
  const data = item.data;
  const [isExpanded, setIsExpanded] = useState(false);
  const liveUsage = useAgent(data.agentId, (a: TopAgentSnapshot) => a.lastUsage);
  const inputTokens = data.inputTokens ?? liveUsage?.inputTokens;
  const outputTokens = data.outputTokens ?? liveUsage?.outputTokens;
  const cachedTokens =
    data.cachedTokens ??
    data.cachedInputTokens ??
    liveUsage?.cachedInputTokens ??
    liveUsage?.cachedTokens;
  const contextUsedTokens =
    data.contextUsedTokens ??
    liveUsage?.contextWindowUsedTokens ??
    liveUsage?.contextUsedTokens;
  const contextMaxTokens =
    data.contextMaxTokens ??
    liveUsage?.contextWindowMaxTokens ??
    liveUsage?.contextMaxTokens;
  const costUsd =
    data.costUsd ?? liveUsage?.totalCostUsd ?? liveUsage?.costUsd;
  const { settings } = usePluginSettings(topSettingsContract);
  const surfaces = settings.metricSurfaces;
  const show = (id: MetricId) => !surfaces || isTimelineEnabled(surfaces[id]);
  const showMcp = isMcpSurfaceEnabled(settings, "timeline", data.mcpInstalled, data.mcpRunning);

  const outcomeConfig = useMemo(() => {
    switch (data.outcomeKind) {
      case "completed":
        return {
          icon: "CheckCircle2",
          color: theme.colors.statusSuccess,
          label: "Turn Completed",
        };
      case "failed":
        return {
          icon: "AlertCircle",
          color: theme.colors.statusDanger,
          label: "Turn Failed",
        };
      case "canceled":
        return {
          icon: "MinusCircle",
          color: theme.colors.statusWarning,
          label: "Turn Canceled",
        };
      default:
        return {
          icon: "Activity",
          color: theme.colors.foregroundMuted,
          label: "Turn Ended",
        };
    }
  }, [data.outcomeKind, theme.colors]);

  // CPU/RAM colors resolve through the shared canonical thresholds
  // (shared/resources.ts) so the timeline card can never diverge from the
  // pill and dashboard surfaces.
  const cpuColor = useMemo(
    () => getStatusColor(resolveMetricStatus(data.cpuPercent, CPU_THRESHOLDS), theme.colors),
    [data.cpuPercent, theme.colors],
  );

  const memColor = useMemo(
    () =>
      getStatusColor(resolveMetricStatus(data.memPercent, MEM_THRESHOLDS), theme.colors),
    [data.memPercent, theme.colors],
  );

  const timeLabel = useMemo(() => {
    try {
      const d = data.timestamp ? new Date(data.timestamp) : timestamp;
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "";
    }
  }, [data.timestamp, timestamp]);

  const totalTokens =
    inputTokens != null || outputTokens != null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined;

  const contextPercent = useMemo(() => {
    if (!contextMaxTokens || contextMaxTokens <= 0) return null;
    return Math.round(((contextUsedTokens ?? 0) / contextMaxTokens) * 100);
  }, [contextUsedTokens, contextMaxTokens]);

  const getCopyText = useCallback(
    () => buildTelemetryCopyText({ data, liveUsage, timeLabel }),
    [data, liveUsage, timeLabel],
  );

  const hasTokenDetails =
    inputTokens != null ||
    outputTokens != null ||
    cachedTokens != null ||
    contextUsedTokens != null ||
    contextMaxTokens != null ||
    costUsd != null;

  const canceledText =
    data.outcomeKind === "canceled"
      ? !/^cancel/i.test(data.outcomeError ?? "")
        ? `Canceled${data.outcomeError ? `: ${data.outcomeError}` : ""}`
        : (data.outcomeError ?? "Canceled")
      : "";

  return (
    <HostThemeProvider theme={theme}>
      <HostCollapsible
        variant="elevated"
        isExpanded={isExpanded}
        onToggle={setIsExpanded}
        style={data.outcomeKind === "failed" ? { borderColor: theme.colors.statusDanger } : undefined}
        title={
          <HostRow gap={6} align="center">
            <Icon name={outcomeConfig.icon} size={14} color={outcomeConfig.color} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.foreground }}>
              {outcomeConfig.label}
            </Text>
            {data.durationMs != null ? (
              <HostBadge label={`${(data.durationMs / 1000).toFixed(1)}s`} variant="neutral" />
            ) : null}
          </HostRow>
        }
        subtitle={
          !isExpanded && data.outcomeKind === "canceled" ? (
            <Text numberOfLines={2} style={{ fontSize: 11, color: theme.colors.statusDanger }}>
              {canceledText}
            </Text>
          ) : undefined
        }
        headerRight={
          <HostRow gap={6} align="center">
            {timeLabel !== "" ? (
              <Text style={{ fontSize: 10, color: theme.colors.foregroundMuted }}>{timeLabel}</Text>
            ) : null}
            <Text
              style={{
                fontSize: 10,
                color: theme.colors.foregroundMuted,
                fontStyle: "italic",
              }}
            >
              via top
            </Text>
            {/*
             * Explicit copy affordance. Web's selection-copy handler only
             * rebuilds clipboard content for `[data-testid="assistant-message"]`
             * selections, so styled timeline items copy nothing
             * (xpufx-org/paseo#278). The helper CopyButton bypasses that gate
             * with the helper's own clipboard path. Empty labels keep the
             * header compact: the icon flips Copy -> Check on success.
             */}
            <HostCopyButton
              getText={getCopyText}
              label=""
              copiedLabel=""
              accessibilityLabel="Copy timeline card"
              toastMessage="timeline card"
            />
          </HostRow>
        }
      >
        <HostStack gap={6}>
          <HostRow wrap gap={8} align="center">
            {show("cpu_ram") && (
              <Vital icon="Cpu" color={cpuColor}>
                CPU {data.cpuPercent}%
              </Vital>
            )}

            {show("cpu_ram") && (
              <Vital icon="Database" color={memColor}>
                RAM {formatBytes(data.memUsedBytes)} ({data.memPercent}%)
              </Vital>
            )}

            {show("load") && (
              <Vital icon="Activity" color={theme.colors.foreground}>
                Load {data.loadAvg1m.toFixed(2)}
              </Vital>
            )}

            {showMcp && (
              <Vital
                icon="Server"
                color={
                  data.mcpTotal == null
                    ? theme.colors.foregroundMuted
                    : (data.mcpHealthy ?? 0) === data.mcpTotal
                      ? theme.colors.statusSuccess
                      : theme.colors.statusWarning
                }
              >
                {data.mcpTotal != null ? `MCP ${data.mcpHealthy ?? 0}/${data.mcpTotal}` : "MCP --"}
              </Vital>
            )}

            {show("agent_id") && (
              <Vital icon="Fingerprint" color={theme.colors.foreground}>
                {data.agentId && data.agentId.length > 7
                  ? data.agentId.slice(0, 7)
                  : (data.agentId ?? "--")}
              </Vital>
            )}

            {show("agent") && (
              <Vital
                icon="Bot"
                color={data.agentModel ? theme.colors.foreground : theme.colors.foregroundMuted}
              >
                {data.agentModel ?? "model --"}
              </Vital>
            )}

            {show("agent_provider") && (
              <Vital
                icon="Globe"
                color={
                  data.agentProvider ? theme.colors.foreground : theme.colors.foregroundMuted
                }
              >
                {data.agentProvider ?? "provider --"}
              </Vital>
            )}

            {show("agent_title") && (
              <Vital
                icon="Tag"
                color={data.agentTitle ? theme.colors.foreground : theme.colors.foregroundMuted}
              >
                {data.agentTitle ?? "title --"}
              </Vital>
            )}

            {show("branch") && (
              <Vital
                icon="GitBranch"
                color={data.branch ? theme.colors.foreground : theme.colors.foregroundMuted}
              >
                {data.branch ?? "branch --"}
              </Vital>
            )}

            {show("worktree") && (
              <Vital
                icon="Folder"
                color={data.worktree ? theme.colors.foreground : theme.colors.foregroundMuted}
              >
                {data.worktree ? truncatePath(data.worktree, 20) : "worktree --"}
              </Vital>
            )}

            {show("uptime") && (
              <Vital icon="Clock" color={theme.colors.foreground}>
                {data.uptimeSeconds ? formatUptime(data.uptimeSeconds) : "--"}
              </Vital>
            )}

            {show("changes") && (
              <Vital icon="GitCommitHorizontal" color={theme.colors.foreground}>
                {(data.gitFilesChanged ?? 0) > 0
                  ? `±${data.gitFilesChanged} files +${data.gitInsertions ?? 0}/-${data.gitDeletions ?? 0}`
                  : "No changes"}
              </Vital>
            )}

            {show("tokens") && (
              <Vital
                icon="Coins"
                color={
                  totalTokens != null || contextUsedTokens != null
                    ? theme.colors.foreground
                    : theme.colors.foregroundMuted
                }
              >
                {contextUsedTokens != null && contextMaxTokens
                  ? `${formatCompactTokens(contextUsedTokens)}/${formatCompactTokens(contextMaxTokens)}${contextPercent != null ? ` (${contextPercent}% ctx)` : ""}`
                  : totalTokens != null
                    ? `${formatCompactTokens(totalTokens)} tok`
                    : contextUsedTokens != null
                      ? `${formatCompactTokens(contextUsedTokens)} ctx`
                      : "tok --"}
              </Vital>
            )}

            {show("tools") && (
              <Vital icon="Sigma" color={theme.colors.foreground}>
                {data.toolCalls != null
                  ? `${data.toolCalls}${data.toolErrors ? ` (${data.toolErrors} err)` : ""}`
                  : "tools --"}
              </Vital>
            )}

            {show("turns") && (
              <Vital
                icon="Repeat"
                color={data.turnCount != null ? theme.colors.foreground : theme.colors.foregroundMuted}
              >
                {data.turnCount != null ? `${data.turnCount} turns` : "turns --"}
              </Vital>
            )}
          </HostRow>

          {show("tokens") && hasTokenDetails ? (
            <HostStack gap={8}>
              <HostRow justify="between" align="center">
                <HostRow gap={4} align="center">
                  <Icon name="Coins" size={12} color={theme.colors.foregroundMuted} />
                  <Text style={sectionTitleStyle(theme.colors)}>Tokens & Context</Text>
                </HostRow>
                {costUsd != null && (
                  <Text style={{ fontSize: 10, fontWeight: "600", color: theme.colors.foreground }}>
                    ${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}
                  </Text>
                )}
              </HostRow>

              {contextMaxTokens != null && contextMaxTokens > 0 ? (
                <HostStack gap={4}>
                  <HostRow justify="between" align="center">
                    <Text style={{ fontSize: 10, color: theme.colors.foregroundMuted }}>
                      Context Window
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: theme.colors.foreground }}>
                      {formatCompactTokens(contextUsedTokens ?? 0)} /{" "}
                      {formatCompactTokens(contextMaxTokens)} ({contextPercent}%)
                    </Text>
                  </HostRow>
                  <HostProgressBar
                    value={contextPercent ?? 0}
                    thresholds={{ warning: 70, danger: 85 }}
                    height={6}
                  />
                </HostStack>
              ) : contextUsedTokens != null ? (
                <Text style={{ fontSize: 10, color: theme.colors.foreground }}>
                  {formatCompactTokens(contextUsedTokens)} tokens
                </Text>
              ) : null}

              <HostRow wrap gap={6} align="center">
                {inputTokens != null && (
                  <HostBadge label={`In: ${inputTokens.toLocaleString()}`} variant="neutral" />
                )}
                {outputTokens != null && (
                  <HostBadge label={`Out: ${outputTokens.toLocaleString()}`} variant="neutral" />
                )}
                {cachedTokens != null && (
                  <HostBadge label={`Cache: ${cachedTokens.toLocaleString()}`} variant="neutral" />
                )}
              </HostRow>
            </HostStack>
          ) : show("tokens") ? (
            <HostRow justify="between" align="center">
              <Text style={sectionTitleStyle(theme.colors)}>Tokens & Context</Text>
              <Text
                style={{
                  fontSize: 10,
                  fontStyle: "italic",
                  color: theme.colors.foregroundMuted,
                }}
              >
                Not reported by provider
              </Text>
            </HostRow>
          ) : null}

          <HostStack gap={4}>
            <Text style={sectionTitleStyle(theme.colors)}>Turn Details</Text>
            <HostRow wrap gap={12} align="center">
              <Vital icon="Cpu" color={theme.colors.foreground}>
                {data.agentModel ?? "Unknown model"} ({data.agentProvider ?? "default"})
              </Vital>
              {data.toolCalls != null && (
                <Vital icon="Sigma" color={theme.colors.foreground}>
                  {data.toolCalls} calls
                  {data.toolErrors ? `, ${data.toolErrors} failed` : ""}
                </Vital>
              )}
              {(data.gitInsertions != null || data.gitDeletions != null) && (
                <Vital icon="GitCommitHorizontal" color={theme.colors.foreground}>
                  +{data.gitInsertions ?? 0} -{data.gitDeletions ?? 0}
                </Vital>
              )}
            </HostRow>
          </HostStack>

          {data.outcomeError && (
            <View
              style={{
                padding: 6,
                borderRadius: 4,
                backgroundColor: theme.colors.surface2,
                borderLeftWidth: 3,
                borderLeftColor: theme.colors.statusDanger,
              }}
            >
              <Text numberOfLines={2} style={{ fontSize: 11, color: theme.colors.statusDanger }}>
                {data.outcomeError}
              </Text>
            </View>
          )}
        </HostStack>
      </HostCollapsible>
    </HostThemeProvider>
  );
}

const styles = {
  // Layout-only. Color MUST come from the theme: a raw style without `color`
  // falls back to React Native's default black and vanishes in dark mode
  // (xpufx-org/paseo#208). Use `sectionTitleStyle(colors)` at call sites.
  sectionTitle: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
} as const;

function sectionTitleStyle(colors: { foregroundMuted: string }) {
  return [styles.sectionTitle, { color: colors.foregroundMuted }];
}
