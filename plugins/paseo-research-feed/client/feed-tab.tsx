import { useState } from "react";
import { Linking, Text, View } from "react-native";
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
  HostStatusDot,
  spacing,
} from "paseo-plugin-helper/ui";
import { feedListRpc, feedRefreshRpc, ideaPromoteRpc, reelActionRpc, reelDigestRpc } from "../shared/registry";
import type { Reel } from "../shared/model";

/**
 * The FEED tab: the upstream skim. One capture card per reel — title, one
 * line, relevance score, link out, and the three operator verbs: Digest
 * (lazily generated on first press), Save, Dismiss. Promote moves a reel
 * into an idea track. Producing is all this tab does; deciding happens when
 * the operator promotes.
 */

export function FeedTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const feed = useRpcQuery(feedListRpc, {});
  const refresh = useRpcMutation(feedRefreshRpc);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: [feedListRpc.name] });
  };

  const runRefresh = () => {
    setRefreshNote(null);
    refresh.mutate({}, {
      onSuccess: (result) => {
        reload();
        const summary = `${result.reels.length} cards, ${result.eagerDigests} eager digests`;
        setRefreshNote(result.errors.length > 0 ? `${summary} — ${result.errors.length} source error(s)` : summary);
        toast.show(`Feed refreshed: ${summary}`, { variant: "success" });
      },
      onError: (error: Error) => toast.show(`Refresh failed: ${error.message}`, { variant: "error" }),
    });
  };

  const reels = feed.data?.reels ?? [];

  return (
    <View style={{ flex: 1, minHeight: 0, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm }}>
      <HostRow align="center" justify="between">
        <HostSectionHeader title="Today's skim" count={reels.length} />
        <HostButton
          label="Refresh"
          icon="RefreshCw"
          size="sm"
          variant="secondary"
          loading={refresh.isPending}
          onPress={runRefresh}
        />
      </HostRow>
      {refreshNote ? (
        <Text selectable style={{ fontSize: 11, opacity: 0.7 }}>
          {refreshNote}
        </Text>
      ) : null}

      {feed.isLoading ? (
        <HostEmptyState icon="Loader" title="Loading the feed" description="Reading stored capture cards." />
      ) : reels.length === 0 ? (
        <HostEmptyState
          icon="FlaskConical"
          title="No cards yet"
          description="Refresh to fetch the pinned sources and rank a skim."
          actionLabel="Refresh feed"
          onAction={runRefresh}
        />
      ) : (
        reels.map((reel) => (
          <ReelCard key={reel.id} reel={reel} onChanged={reload} onPromoted={reload} />
        ))
      )}
    </View>
  );
}

function ReelCard({ reel, onChanged, onPromoted }: { reel: Reel; onChanged: () => void; onPromoted: () => void }) {
  const toast = useToast();
  const digest = useRpcMutation(reelDigestRpc);
  const action = useRpcMutation(reelActionRpc);
  const promote = useRpcMutation(ideaPromoteRpc);

  const runAction = (verb: "save" | "dismiss") => {
    action.mutate(
      { reelId: reel.id, action: verb },
      {
        onSuccess: () => {
          onChanged();
          toast.show(verb === "save" ? "Saved" : "Dismissed", { variant: "success" });
        },
        onError: (error: Error) => toast.show(`Failed: ${error.message}`, { variant: "error" }),
      },
    );
  };

  const runDigest = () => {
    digest.mutate(
      { reelId: reel.id },
      {
        onSuccess: () => onChanged(),
        onError: (error: Error) => toast.show(`Digest failed: ${error.message}`, { variant: "error" }),
      },
    );
  };

  const runPromote = () => {
    promote.mutate(
      { reelId: reel.id },
      {
        onSuccess: (result) => {
          onPromoted();
          toast.show(`Promoted to idea: ${result.idea.title}`, { variant: "success" });
        },
        onError: (error: Error) => toast.show(`Promote failed: ${error.message}`, { variant: "error" }),
      },
    );
  };

  return (
    <HostCard variant="elevated">
      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <HostStatusDot variant={reel.digest ? "success" : "neutral"} size="sm" />
          <HostBadge label={reel.source} variant="info" size="sm" />
          <HostBadge label={relevanceLabel(reel.relevance)} variant={reel.relevance >= 0.7 ? "success" : "neutral"} size="sm" />
          {reel.status !== "new" ? <HostBadge label={reel.status} variant="neutral" size="sm" /> : null}
        </View>
        <Text selectable style={{ fontSize: 14, fontWeight: "600" }}>
          {reel.title}
        </Text>
        <Text selectable style={{ fontSize: 12, opacity: 0.8 }}>
          {reel.hook}
        </Text>
        {reel.whyItMatters ? (
          <Text selectable style={{ fontSize: 11, opacity: 0.65 }}>
            {reel.whyItMatters}
          </Text>
        ) : null}

        {reel.digest ? (
          <HostCollapsible title="10-minute digest" subtitle={`saved ${reel.digest.at.slice(0, 16).replace("T", " ")}`}>
            <Text selectable style={{ fontSize: 12, lineHeight: 18 }}>
              {reel.digest.text}
            </Text>
            {(reel.questions ?? []).map((question) => (
              <Text key={question} selectable style={{ fontSize: 12, opacity: 0.75, marginTop: spacing.xs }}>
                • {question}
              </Text>
            ))}
          </HostCollapsible>
        ) : null}

        <HostRow align="center" justify="between" style={{ marginTop: spacing.xs }}>
          <HostRow align="center" gap={spacing.xs}>
            <HostButton
              label={reel.digest ? "Digest ready" : "Digest"}
              icon="BookOpen"
              size="sm"
              variant="secondary"
              loading={digest.isPending}
              disabled={Boolean(reel.digest)}
              onPress={runDigest}
            />
            <HostButton label="Open" icon="ExternalLink" size="sm" variant="ghost" onPress={() => void Linking.openURL(reel.url)} />
          </HostRow>
          <HostRow align="center" gap={spacing.xs}>
            <HostButton label="Promote" icon="Lightbulb" size="sm" variant="primary" loading={promote.isPending} onPress={runPromote} />
            <HostButton label="Save" icon="Bookmark" size="sm" variant="secondary" loading={action.isPending} onPress={() => runAction("save")} />
            <HostButton label="Dismiss" icon="X" size="sm" variant="ghost" onPress={() => runAction("dismiss")} />
          </HostRow>
        </HostRow>
      </View>
    </HostCard>
  );
}

function relevanceLabel(relevance: number): string {
  return `${Math.round(Math.min(1, Math.max(0, relevance)) * 100)}%`;
}
