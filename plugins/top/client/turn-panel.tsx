import React, { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import type { PluginAgentPanelProps } from "@getpaseo/plugin/client";
import { useAgent, usePaseo } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HostBadge,
  HostCard,
  HostCardHeader,
  HostEmptyState,
  HostKeyValue,
  HostLayoutProvider,
  HostRow,
  HostScroll,
  HostSectionHeader,
  HostStack,
  HostThemeProvider,
  useHostLayout,
  useHostTheme,
} from "paseo-plugin-helper/ui";
import {
  currentTurn,
  fetchAllTurns,
  formatTurnAddress,
  type TurnRef,
} from "./turn-counter";
import type { TopAgentSnapshot } from "./pill-labels";

function previewLine(text: string): string {
  const first = text.split("\n", 1)[0]?.trim() ?? "";
  return first.length > 0 ? first : "(empty message)";
}

/**
 * A conversation's turns are ordered by the canonical timeline `seq`, and a
 * user_message row maps 1:1 to an entry (not identity-merged), so the 1-based
 * index of the sorted rows is the same turn number the agent resolves when it
 * reads its own timeline. `Turn #N (seq S)` is therefore addressable by both
 * sides. Refresh is event-driven (agent upserts) plus a slow poll while the
 * panel is open; full history is paged, so the count does not reset to the
 * tail window on long conversations.
 *
 * Registered with the raw `addWorkspacePanel`, which does not inject a theme
 * provider (unlike `registerWorkspacePanel`), so the body is wrapped here.
 * The panel host supplies no scroller, so HostScroll owns the one scroll
 * region below the pinned header row.
 */
export function TurnCounterPanel({ theme, layout, agentId }: PluginAgentPanelProps) {
  return (
    <HostThemeProvider theme={theme}>
      <HostLayoutProvider layout={layout}>
        <TurnCounterBody agentId={agentId} />
      </HostLayoutProvider>
    </HostThemeProvider>
  );
}

function TurnCounterBody({ agentId }: { agentId: string }) {
  const { colors } = useHostTheme();
  const { compact } = useHostLayout();
  const paseo = usePaseo();
  const queryClient = useQueryClient();

  const agent = useAgent(agentId, (a: TopAgentSnapshot) => ({
    title: a?.title ?? null,
    status: a?.status ?? null,
  }));

  const turnsQuery = useQuery({
    queryKey: ["top-turn-counter", agentId],
    queryFn: () => fetchAllTurns(paseo, agentId),
    refetchInterval: 5000,
    refetchOnMount: "always",
  });

  // Turn boundaries land as agent upserts; refetch immediately instead of
  // waiting out the poll interval.
  useEffect(() => {
    const unsubscribe = paseo.agents.subscribe((update) => {
      if (update.kind === "upsert" && update.agent.id === agentId) {
        void queryClient.invalidateQueries({ queryKey: ["top-turn-counter", agentId] });
      }
    });
    return unsubscribe;
  }, [paseo, agentId, queryClient]);

  const turns: TurnRef[] = turnsQuery.data ?? [];
  const latest = currentTurn(turns);

  // Newest first, so the last turn is the first row the operator sees.
  const ordered = useMemo(() => [...turns].reverse(), [turns]);

  // Host-density padding (the helper's "comfortable" scale): the host owns
  // density now, so the panel keeps the same numeric rhythm locally.
  const padding = compact
    ? { horizontal: 12, vertical: 10, gap: 8 }
    : { horizontal: 16, vertical: 14, gap: 12 };

  return (
    <View style={styles.panelRoot}>
      <HostRow
        justify="between"
        align="center"
        gap={8}
        style={{
          paddingHorizontal: padding.horizontal,
          paddingTop: padding.vertical,
          paddingBottom: padding.gap,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
          Turn Counter
        </Text>
        {agent?.status ? (
          <HostBadge
            label={agent.status}
            variant={agent.status === "running" ? "success" : "neutral"}
            size="sm"
            dot
          />
        ) : null}
      </HostRow>
      <HostScroll
        style={styles.scroll}
        contentContainerStyle={{
          gap: padding.gap,
          paddingHorizontal: padding.horizontal,
          paddingBottom: padding.vertical,
        }}
      >
        <HostCard variant="elevated">
          <HostCardHeader
            title="Current turn"
            icon="Repeat"
            subtitle="Deterministic from the timeline seq shared with the agent"
            value={
              <HostBadge
                label={latest ? formatTurnAddress(latest.turn, latest.seq) : "-"}
                variant={latest ? "accent" : "neutral"}
                size="sm"
              />
            }
          />
          {latest ? (
            <HostKeyValue
              label="Address"
              value={formatTurnAddress(latest.turn, latest.seq)}
              subValue={previewLine(latest.preview)}
              copyable
              mono
            />
          ) : (
            <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
              {turnsQuery.isPending ? "Reading timeline…" : "No user turns recorded yet."}
            </Text>
          )}
        </HostCard>

        {turnsQuery.error ? (
          <Text selectable style={{ color: colors.statusDanger, fontSize: 12 }}>
            Failed to read timeline: {String(turnsQuery.error)}
          </Text>
        ) : null}

        {ordered.length > 0 ? (
          <>
            <HostSectionHeader title="Turns" count={ordered.length} />
            <HostStack gap={8}>
              {ordered.map((turn) => (
                <HostCard key={turn.seq} variant="elevated">
                  <HostKeyValue
                    label={formatTurnAddress(turn.turn, turn.seq)}
                    value={previewLine(turn.preview)}
                    subValue={`seq ${turn.seq}`}
                    copyable
                    mono
                  />
                </HostCard>
              ))}
            </HostStack>
          </>
        ) : !turnsQuery.isPending && !turnsQuery.error ? (
          <HostEmptyState
            icon="MessageSquare"
            title="No turns yet"
            description="Send the agent a message and its first turn will appear here."
          />
        ) : null}
      </HostScroll>
    </View>
  );
}

const styles = {
  panelRoot: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
} as const;
