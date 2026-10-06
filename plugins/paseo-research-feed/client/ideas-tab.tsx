import { useState } from "react";
import { Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useRpcMutation, useRpcQuery } from "paseo-plugin-helper/core";
import {
  HostBadge,
  HostButton,
  HostCard,
  HostCollapsible,
  HostEmptyState,
  HostRow,
  HostSectionHeader,
  HostTextInput,
  spacing,
} from "paseo-plugin-helper/ui";
import type { StatusVariant } from "paseo-plugin-helper/shared";
import { ideaListRpc, ideaDiscussRpc, ideaQueueRpc, ideaShapeRpc, runQueuedRpc } from "../shared/registry";
import { isRunnable, type Idea, type IdeaStage } from "../shared/model";

/**
 * The IDEAS tab: the operator-driven half of the pipeline. Each track walks
 * promote → discuss → shape → queued → run, and the ONLY gate between an
 * idea and a run is the operator pressing Queue. Discussion is a simple
 * text thread per idea.
 */

const IDEAS_QUERY_KEY = [ideaListRpc.name, {}];

const STAGE_BADGE: Record<IdeaStage, { label: string; variant: StatusVariant }> = {
  exploring: { label: "exploring", variant: "info" },
  shaped: { label: "shaped", variant: "accent" },
  queued: { label: "queued", variant: "warning" },
  running: { label: "running", variant: "accent" },
  debriefed: { label: "debriefed", variant: "success" },
};

export function IdeasTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const ideas = useRpcQuery(ideaListRpc, {});
  const runAll = useRpcMutation(runQueuedRpc);

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: [ideaListRpc.name] });
  };

  const runQueued = () => {
    runAll.mutate({}, {
      onSuccess: (result) => {
        reload();
        const ok = result.runs.filter((run) => run.ok).length;
        toast.show(`Runs finished: ${ok}/${result.runs.length} ok`, {
          variant: result.runs.every((run) => run.ok) ? "success" : "error",
        });
      },
      onError: (error: Error) => toast.show(`Run failed: ${error.message}`, { variant: "error" }),
    });
  };

  const tracks = ideas.data?.ideas ?? [];
  const queuedCount = tracks.filter(isRunnable).length;

  return (
    <View style={{ flex: 1, minHeight: 0, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm }}>
      <HostRow align="center" justify="between">
        <HostSectionHeader title="Idea tracks" count={tracks.length} />
        <HostButton
          label={queuedCount > 0 ? `Run queued (${queuedCount})` : "Run queued"}
          icon="Play"
          size="sm"
          variant="primary"
          loading={runAll.isPending}
          disabled={queuedCount === 0}
          onPress={runQueued}
        />
      </HostRow>

      {ideas.isLoading ? (
        <HostEmptyState icon="Loader" title="Loading ideas" description="Reading stored idea tracks." />
      ) : tracks.length === 0 ? (
        <HostEmptyState
          icon="Lightbulb"
          title="No idea tracks yet"
          description="Promote a card from the Feed tab to start a track."
        />
      ) : (
        tracks.map((idea) => <IdeaTrack key={idea.id} idea={idea} onChanged={reload} />)
      )}
    </View>
  );
}

function IdeaTrack({ idea, onChanged }: { idea: Idea; onChanged: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const discuss = useRpcMutation(ideaDiscussRpc);
  const shape = useRpcMutation(ideaShapeRpc);
  const queue = useRpcMutation(ideaQueueRpc);
  const run = useRpcMutation(runQueuedRpc);
  const stage = STAGE_BADGE[idea.stage];

  const sendDiscussion = () => {
    const message = draft.trim();
    if (!message) return;
    discuss.mutate(
      { ideaId: idea.id, message },
      {
        onSuccess: () => {
          setDraft("");
          onChanged();
        },
        onError: (error: Error) => toast.show(`Discuss failed: ${error.message}`, { variant: "error" }),
      },
    );
  };

  const runShape = () => {
    shape.mutate(
      { ideaId: idea.id },
      {
        onSuccess: () => {
          onChanged();
          toast.show("Experiment shaped", { variant: "success" });
        },
        onError: (error: Error) => toast.show(`Shape failed: ${error.message}`, { variant: "error" }),
      },
    );
  };

  const runQueue = () => {
    queue.mutate(
      { ideaId: idea.id },
      {
        onSuccess: () => {
          onChanged();
          toast.show("Queued — your gate, your call", { variant: "success" });
        },
        onError: (error: Error) => toast.show(`Queue failed: ${error.message}`, { variant: "error" }),
      },
    );
  };

  const runOne = () => {
    run.mutate(
      { ideaId: idea.id },
      {
        onSuccess: (result) => {
          onChanged();
          const outcome = result.runs[0];
          if (outcome?.ok) toast.show("Run finished — debrief saved", { variant: "success" });
          else toast.show(`Run failed: ${outcome?.error ?? "unknown error"}`, { variant: "error" });
        },
        onError: (error: Error) => toast.show(`Run failed: ${error.message}`, { variant: "error" }),
      },
    );
  };

  return (
    <HostCard variant="elevated">
      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <HostBadge label={stage.label} variant={stage.variant} size="sm" dot={idea.stage === "running"} />
          <Text selectable style={{ fontSize: 11, opacity: 0.6 }}>
            from {idea.fromReel}
          </Text>
        </View>
        <Text selectable style={{ fontSize: 14, fontWeight: "600" }}>
          {idea.title}
        </Text>
        {idea.seed ? (
          <Text selectable style={{ fontSize: 12, opacity: 0.75 }}>
            {idea.seed}
          </Text>
        ) : null}

        {idea.experiment ? (
          <HostCollapsible title="Experiment" subtitle={`${idea.experiment.gpuBudgetMin} min budget`} initiallyExpanded={false}>
            <Text selectable style={{ fontSize: 12, lineHeight: 18 }}>
              HYPOTHESIS: {idea.experiment.hypothesis}
            </Text>
            <Text selectable style={{ fontSize: 12, lineHeight: 18, marginTop: spacing.xs }}>
              METHOD: {idea.experiment.method}
            </Text>
            <Text selectable style={{ fontSize: 12, lineHeight: 18, marginTop: spacing.xs }}>
              SUCCESS METRIC: {idea.experiment.successMetric}
            </Text>
            <Text selectable style={{ fontSize: 12, lineHeight: 18, marginTop: spacing.xs }}>
              FRONTIER CLAIM: {idea.experiment.frontierClaim}
            </Text>
          </HostCollapsible>
        ) : null}

        {idea.execution?.resultText ? (
          <HostCollapsible title="Run output" subtitle={idea.execution.stopReason}>
            <Text selectable style={{ fontSize: 12, lineHeight: 18 }}>
              {idea.execution.resultText}
            </Text>
          </HostCollapsible>
        ) : null}

        {idea.debrief ? (
          <HostCollapsible title="Debrief" subtitle={idea.debrief.at.slice(0, 16).replace("T", " ")}>
            <Text selectable style={{ fontSize: 12, lineHeight: 18 }}>
              WHAT HAPPENED: {idea.debrief.whatHappened}
            </Text>
            <Text selectable style={{ fontSize: 12, lineHeight: 18, marginTop: spacing.xs }}>
              FRONTIER VS REALITY: {idea.debrief.frontierVsReality}
            </Text>
            <Text selectable style={{ fontSize: 12, lineHeight: 18, marginTop: spacing.xs }}>
              NEXT: {idea.debrief.next}
            </Text>
          </HostCollapsible>
        ) : null}

        {idea.discussion.length > 0 ? (
          <View style={{ marginTop: spacing.xs, gap: 2 }}>
            {idea.discussion.map((turn, index) => (
              <Text key={`${turn.at}-${index}`} selectable style={{ fontSize: 12, opacity: turn.role === "operator" ? 0.9 : 0.7 }}>
                {turn.role === "operator" ? "you: " : "mentor: "}
                {turn.text}
              </Text>
            ))}
          </View>
        ) : null}

        <HostTextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Think it through with the mentor…"
          multiline
        />

        <HostRow align="center" justify="between" style={{ marginTop: spacing.xs }}>
          <HostRow align="center" gap={spacing.xs}>
            <HostButton
              label="Discuss"
              icon="MessagesSquare"
              size="sm"
              variant="primary"
              loading={discuss.isPending}
              disabled={draft.trim().length === 0}
              onPress={sendDiscussion}
            />
            <HostButton
              label={idea.experiment ? "Re-shape" : "Shape experiment"}
              icon="PenLine"
              size="sm"
              variant="secondary"
              loading={shape.isPending}
              onPress={runShape}
            />
          </HostRow>
          <HostRow align="center" gap={spacing.xs}>
            <HostButton
              label="Queue"
              icon="Clock"
              size="sm"
              variant="secondary"
              loading={queue.isPending}
              disabled={!idea.experiment?.method || idea.stage === "queued" || idea.stage === "running"}
              onPress={runQueue}
            />
            <HostButton
              label="Run"
              icon="Play"
              size="sm"
              variant="primary"
              loading={run.isPending}
              disabled={!isRunnable(idea) || idea.stage === "running"}
              onPress={runOne}
            />
          </HostRow>
        </HostRow>
      </View>
    </HostCard>
  );
}
