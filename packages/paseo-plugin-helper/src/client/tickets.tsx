import React, { useState, useMemo } from "react";
import { View, Text, Linking, StyleSheet } from "react-native";
import { usePluginTheme } from "./theme/index.js";
import { getClientHost } from "./host.js";
import { useRpcQuery, useRpcMutation } from "./query.js";
import { Button } from "./components/Button.js";
import { Card } from "./components/Card.js";
import { Badge } from "./components/Badge.js";
import { Stack } from "./layout/Stack.js";
import { Row } from "./layout/Row.js";
import { KeyValue, KeyValueGroup } from "./components/KeyValue.js";
import { CommandBox } from "./components/CommandBox.js";
import { CopyButton } from "./components/CopyButton.js";
import { CodeBlock } from "./components/CodeBlock.js";
import { HighlightedText } from "./components/HighlightedText.js";
import { Collapsible } from "./components/Collapsible.js";
import { FormRow } from "./layout/FormRow.js";
import { ActionBar } from "./layout/ActionBar.js";
import { TextInput } from "./components/TextInput.js";
import { EmptyState } from "./components/EmptyState.js";
import { copyToClipboard } from "./utils/clipboard.js";
import {
  STATE_ORDER,
  PRIORITY_ORDER,
  ATTENTION_LABELS,
  SPEC_LABELS,
  shortLabelName,
  currentStateLabel,
  currentPriorityLabel,
  nextStateLabel,
  parseLabelList,
  writeGateNotice,
  stripAgentEnvelopeFooter,
  parseMarkdownLite,
  issueDetailContract,
  setLabelContract,
  addCommentContract,
  createIssueContract,
  type ForgeIssue,
  type IssueComment,
  type AgentEnvelope,
  type ForgeAccessState,
  type ForgeLabel,
  type MarkdownLiteSpan,
} from "../shared/tickets.js";

function formatTimestamp(value: string | undefined | null): string {
  if (!value) return "unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function editorLabelChips(
  names: readonly string[],
  known: Map<string, ForgeLabel>,
): ForgeLabel[] {
  return names.map((name) => known.get(name) ?? { name });
}

// ---------------------------------------------------------------------------
// MarkdownLite
// ---------------------------------------------------------------------------

function renderInlineSpans(
  spans: MarkdownLiteSpan[],
  colors: { foreground: string; accent: string },
  keyPrefix: string,
  query: string,
) {
  return spans.map((span, index) => {
    const key = `${keyPrefix}-${index}`;
    if (span.kind === "bold") {
      return (
        <Text key={key} style={styles.bold}>
          <HighlightedText text={span.text} query={query} />
        </Text>
      );
    }
    if (span.kind === "italic") {
      return (
        <Text key={key} style={styles.italic}>
          <HighlightedText text={span.text} query={query} />
        </Text>
      );
    }
    if (span.kind === "code") {
      return (
        <Text key={key} style={[styles.inlineCode, { backgroundColor: colors.accent + "18" }]}>
          <HighlightedText text={span.text} query={query} />
        </Text>
      );
    }
    if (span.kind === "link") {
      return (
        <Text
          key={key}
          style={[styles.link, { color: colors.accent }]}
          onPress={() => {
            Linking.openURL(span.url).catch(() => {
              copyToClipboard(span.url).catch(() => {});
            });
          }}
        >
          <HighlightedText text={span.text} query={query} />
        </Text>
      );
    }
    return <HighlightedText key={key} text={span.text} query={query} />;
  });
}

export function MarkdownLite({
  body,
  query = "",
}: {
  body: string;
  query?: string;
}) {
  const { colors, typography } = usePluginTheme();
  const blocks = useMemo(() => parseMarkdownLite(body), [body]);

  return (
    <Stack gap="xs" style={styles.markdownContainer}>
      {blocks.map((block, index) => {
        if (block.kind === "code") {
          return <CodeBlock key={index} code={block.text} language={block.language} />;
        }
        if (block.kind === "heading") {
          const fontSize = block.level === 1 ? 18 : block.level === 2 ? 16 : 14;
          return (
            <Text
              key={index}
              selectable
              style={[
                typography.heading,
                { fontSize, fontWeight: "700", color: colors.foreground, marginTop: 4 },
              ]}
            >
              {renderInlineSpans(block.spans, colors, `h${index}`, query)}
            </Text>
          );
        }
        if (block.kind === "list") {
          return (
            <Stack key={index} gap="xxs" style={styles.listContainer}>
              {block.items.map((item, itemIndex) => (
                <Row key={itemIndex} align="flex-start" gap="xs">
                  <Text selectable style={[typography.body, { color: colors.foregroundMuted }]}>
                    {block.ordered ? `${itemIndex + 1}.` : "•"}
                  </Text>
                  <Text selectable style={[typography.body, { color: colors.foreground, flex: 1 }]}>
                    {renderInlineSpans(item, colors, `li${index}-${itemIndex}`, query)}
                  </Text>
                </Row>
              ))}
            </Stack>
          );
        }
        return (
          <Text
            key={index}
            selectable
            style={[typography.body, { color: colors.foreground, lineHeight: 20 }]}
          >
            {renderInlineSpans(block.spans, colors, `p${index}`, query)}
          </Text>
        );
      })}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// AgentEnvelopeCard
// ---------------------------------------------------------------------------

export function AgentEnvelopeCard({ envelope }: { envelope: AgentEnvelope }) {
  const openSession = () => {
    const link = envelope.paseoLinks[0];
    if (!link) return;
    Linking.openURL(link).catch(() => {
      copyToClipboard(link).catch(() => {});
    });
  };

  return (
    <Card variant="tinted" style={styles.envelopeCard}>
      <Card.Header
        title={envelope.sessionTitle}
        subtitle={envelope.postedAt ?? undefined}
        badge={<Badge variant="neutral" label={envelope.agentShortId} />}
        icon="Bot"
      />
      <KeyValueGroup columns={2}>
        <KeyValue label="Model" value={envelope.model ?? "-"} mono />
        <KeyValue
          label="Branch"
          value={envelope.branch ? `${envelope.repo ?? ""}:${envelope.branch}` : "-"}
          mono
          copyable={Boolean(envelope.branch)}
        />
      </KeyValueGroup>
      {envelope.commitShas.length > 0 ? (
        <Stack gap="xxs" style={styles.shaList}>
          {envelope.commitShas.map((sha) => (
            <CommandBox key={sha} command={sha} copyLabel={`Copy commit ${sha}`} />
          ))}
        </Stack>
      ) : null}
      {envelope.paseoLinks.length > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          icon="ExternalLink"
          label="Open agent session"
          onPress={openSession}
        />
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CommentCard
// ---------------------------------------------------------------------------

export function CommentCard({
  comment,
  issueUrl,
  query,
}: {
  comment: IssueComment;
  issueUrl?: string;
  query?: string;
}) {
  const body = stripAgentEnvelopeFooter(comment.body) || comment.body;
  const target = comment.url || issueUrl || "";
  const open = () => {
    if (target) Linking.openURL(target).catch(() => {});
  };

  return (
    <Card variant="flat" style={styles.commentCard}>
      <Card.Header
        title={comment.author}
        subtitle={formatTimestamp(comment.createdAt)}
        icon="MessageSquare"
      />
      <Stack gap="xs" style={styles.commentContent}>
        <MarkdownLite body={body} query={query} />
        {target ? (
          <Row justify="flex-end" align="center" gap="xs">
            <Button
              size="sm"
              variant="ghost"
              icon="ExternalLink"
              label="Open comment"
              accessibilityLabel={`Open comment by ${comment.author}`}
              onPress={open}
            />
            <CopyButton text={target} label="Copy" accessibilityLabel="Copy comment link" />
          </Row>
        ) : null}
      </Stack>
      {comment.envelope ? <AgentEnvelopeCard envelope={comment.envelope} /> : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ScopedLabelGroup
// ---------------------------------------------------------------------------

export function ScopedLabelGroup({
  title,
  labels,
  active,
  pending = false,
  onSelect,
}: {
  title: string;
  labels: readonly ForgeLabel[];
  active: string | null;
  pending?: boolean;
  onSelect: (label: string) => void;
}) {
  const { colors, typography } = usePluginTheme();

  return (
    <Stack gap="xxs" style={styles.labelGroup}>
      <Text style={[typography.caption, { color: colors.foregroundMuted, fontWeight: "600" }]}>
        {title}
      </Text>
      <Row wrap gap="xxs">
        {labels.map((label) => {
          const isSelected = active === label.name;
          return (
            <Button
              key={label.name}
              onPress={() => onSelect(label.name)}
              disabled={pending}
              accessibilityLabel={shortLabelName(label.name)}
              size="sm"
              variant={isSelected ? "primary" : "ghost"}
              label={shortLabelName(label.name)}
            />
          );
        })}
      </Row>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// NewIssueComposer
// ---------------------------------------------------------------------------

export function NewIssueComposer({
  directory,
  remoteUrl,
  access,
  onCreated,
  onOpenSettings,
}: {
  directory?: string;
  remoteUrl?: string;
  access?: ForgeAccessState;
  onCreated?: (number?: number) => void;
  onOpenSettings?: () => void;
}) {
  const { colors, typography } = usePluginTheme();
  const { useToast } = getClientHost();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [labelsText, setLabelsText] = useState("");

  const create = useRpcMutation(createIssueContract, {
    onSuccess: (result) => {
      if (result.error) {
        toast?.error?.(result.error);
        return;
      }
      setTitle("");
      setBody("");
      setLabelsText("");
      setExpanded(false);
      onCreated?.(result.number ?? undefined);
      toast?.show?.(result.number ? `Created issue #${result.number}` : "Issue created", {
        variant: "success",
      });
    },
    onError: (error) => {
      toast?.error?.(error instanceof Error ? error.message : "Could not create issue");
    },
  });

  if (access && access.auth === "anonymous") return null;
  if (access && !access.canEdit) {
    return (
      <Card variant="flat" style={styles.readOnlyCard}>
        <Text style={[typography.caption, { color: colors.foregroundMuted }]}>
          {writeGateNotice(access, "creating issues")}
        </Text>
        {onOpenSettings && (
          <Button
            size="sm"
            variant="secondary"
            icon="Settings"
            label="Add a token"
            onPress={onOpenSettings}
          />
        )}
      </Card>
    );
  }

  const pending = create.isPending;
  const canSubmit = title.trim().length > 0 && !pending;

  const submit = () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    create.mutate({
      directory: directory ?? undefined,
      remoteUrl: remoteUrl || undefined,
      title: nextTitle,
      body: body.trim(),
      labels: parseLabelList(labelsText),
    });
  };

  return (
    <Collapsible
      title="New ticket"
      subtitle="Open a ticket on the active forge"
      icon="Plus"
      isExpanded={expanded}
      onToggle={setExpanded}
    >
      <Stack gap="xs" style={styles.composerForm}>
        <FormRow label="Title">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Short, specific title"
            autoCapitalize="sentences"
          />
        </FormRow>
        <FormRow label="Description" description="Markdown supported.">
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What needs to happen?"
            multiline
            numberOfLines={4}
          />
        </FormRow>
        <Collapsible title="Labels" subtitle="Optional — comma-separated names" icon="Tags">
          <FormRow label="Label names">
            <TextInput
              value={labelsText}
              onChangeText={setLabelsText}
              placeholder="state/1-wip, priority/1-high"
            />
          </FormRow>
        </Collapsible>
        <ActionBar>
          <Button
            label="Cancel"
            variant="ghost"
            disabled={pending}
            onPress={() => setExpanded(false)}
          />
          <Button
            label={pending ? "Creating…" : "Create ticket"}
            variant="primary"
            icon="Plus"
            disabled={!canSubmit}
            loading={pending}
            onPress={submit}
          />
        </ActionBar>
      </Stack>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// TicketLifecycleView
// ---------------------------------------------------------------------------

export interface TicketLifecycleViewProps {
  issueNumber: number;
  workspaceId?: string;
  directory?: string;
  remoteUrl?: string;
  repo?: string | null;
  query?: string;
  boardLabels?: Map<string, ForgeLabel>;
  onRefresh?: () => void;
  onOpenSettings?: () => void;
  children?: React.ReactNode;
}

export function TicketLifecycleView({
  issueNumber,
  workspaceId: _workspaceId,
  directory,
  remoteUrl,
  repo: _repo,
  query = "",
  boardLabels,
  onRefresh,
  onOpenSettings: _onOpenSettings,
  children,
}: TicketLifecycleViewProps) {
  const { colors, typography } = usePluginTheme();
  const { useToast } = getClientHost();
  const toast = useToast();

  const baseInput = {
    issueNumber,
    directory: directory ?? undefined,
    remoteUrl: remoteUrl || undefined,
  };

  const detail = useRpcQuery(
    issueDetailContract,
    baseInput,
    { refetchInterval: 30000 },
  );

  const [commentDraft, setCommentDraft] = useState("");

  const setLabel = useRpcMutation(setLabelContract, {
    onSuccess: (result) => {
      if (result.error) {
        toast?.error?.(result.error);
        return;
      }
      detail.refetch();
      onRefresh?.();
    },
    onError: (error) => {
      toast?.error?.(error instanceof Error ? error.message : "Could not update labels");
    },
  });

  const addComment = useRpcMutation(addCommentContract, {
    onSuccess: (result) => {
      if (result.error) {
        toast?.error?.(result.error);
        return;
      }
      setCommentDraft("");
      detail.refetch();
      onRefresh?.();
      toast?.show?.("Comment posted", { variant: "success" });
    },
    onError: (error) => {
      toast?.error?.(error instanceof Error ? error.message : "Could not post comment");
    },
  });

  const issue = detail.data && !detail.data.error ? detail.data.issue : null;
  const labels = issue?.labels ?? [];
  const state = currentStateLabel(labels);
  const priority = issue ? currentPriorityLabel(labels) : null;
  const next = issue ? nextStateLabel(labels) : null;
  const labelPending = setLabel.isPending;
  const commentPending = addComment.isPending;

  const candidates = useMemo(() => {
    const known = new Map(boardLabels ?? new Map());
    for (const label of issue?.labelDetails ?? []) known.set(label.name, label);
    return {
      state: editorLabelChips(STATE_ORDER, known),
      priority: editorLabelChips(PRIORITY_ORDER, known),
      attention: editorLabelChips(ATTENTION_LABELS, known),
      spec: editorLabelChips(SPEC_LABELS, known),
    };
  }, [boardLabels, issue?.labelDetails]);

  const handleSelectLabel = (labelName: string) => {
    setLabel.mutate({
      issueNumber,
      directory: directory ?? undefined,
      remoteUrl: remoteUrl || undefined,
      label: labelName,
    });
  };

  const handlePostComment = () => {
    const text = commentDraft.trim();
    if (!text) return;
    addComment.mutate({
      issueNumber,
      directory: directory ?? undefined,
      remoteUrl: remoteUrl || undefined,
      body: text,
    });
  };

  return (
    <Stack gap="sm" style={styles.lifecycleContainer}>
      {detail.isLoading && !detail.data ? (
        <Text style={[typography.caption, { color: colors.foregroundMuted }]}>
          Loading ticket #{issueNumber}…
        </Text>
      ) : null}

      {detail.data?.error || (!detail.isLoading && !issue) ? (
        <EmptyState
          icon="AlertCircle"
          title={`Ticket #${issueNumber} unavailable`}
          description={detail.data?.error ?? "Could not reach forge host."}
          actionLabel="Retry"
          onAction={() => detail.refetch()}
        />
      ) : null}

      {/* Label Management: Next state promotion & Scoped label groups */}
      <Stack gap="xs" style={styles.sectionBlock}>
        {next && (
          <Row align="center" gap="xs">
            <Button
              size="sm"
              variant="secondary"
              icon="ArrowRight"
              label={`Move to ${shortLabelName(next).toLowerCase()}`}
              loading={labelPending}
              disabled={labelPending}
              onPress={() => handleSelectLabel(next)}
            />
          </Row>
        )}

        <ScopedLabelGroup
          title="Workflow State"
          labels={candidates.state}
          active={state}
          pending={labelPending}
          onSelect={handleSelectLabel}
        />

        <ScopedLabelGroup
          title="Priority"
          labels={candidates.priority}
          active={priority}
          pending={labelPending}
          onSelect={handleSelectLabel}
        />

        <ScopedLabelGroup
          title="Attention"
          labels={candidates.attention}
          active={labels.find((l: string) => (ATTENTION_LABELS as readonly string[]).includes(l)) ?? null}
          pending={labelPending}
          onSelect={handleSelectLabel}
        />

        <ScopedLabelGroup
          title="Spec"
          labels={candidates.spec}
          active={labels.find((l: string) => (SPEC_LABELS as readonly string[]).includes(l)) ?? null}
          pending={labelPending}
          onSelect={handleSelectLabel}
        />
      </Stack>

      {/* Embedded children (e.g. Worktree branch KeyValue, Close, Dispatch buttons) */}
      {children}

      {/* Ticket Description */}
      {issue?.body ? (
        <Card variant="flat" style={styles.bodyCard}>
          <Card.Header title="Description" icon="FileText" />
          <View style={styles.bodyPadding}>
            <MarkdownLite body={issue.body} query={query} />
          </View>
        </Card>
      ) : null}

      {/* Comments List & Adding Comments */}
      <Card variant="flat" style={styles.commentsCard}>
        <Card.Header
          title={`Comments${issue?.comments ? ` (${issue.comments.length})` : ""}`}
          icon="MessageSquare"
        />
        <Stack gap="xs" style={styles.commentsList}>
          {issue?.comments && issue.comments.length > 0 ? (
            issue.comments.map((comment: IssueComment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                issueUrl={issue.webUrl}
                query={query}
              />
            ))
          ) : (
            <Text style={[typography.caption, { color: colors.foregroundMuted }]}>
              No comments yet.
            </Text>
          )}

          {/* Add Comment input */}
          <Stack gap="xxs" style={styles.newCommentBox}>
            <TextInput
              value={commentDraft}
              onChangeText={setCommentDraft}
              placeholder="Write a comment…"
              multiline
              numberOfLines={3}
            />
            <Row justify="flex-end">
              <Button
                size="sm"
                variant="primary"
                icon="Send"
                label={commentPending ? "Posting…" : "Post comment"}
                disabled={!commentDraft.trim() || commentPending}
                loading={commentPending}
                onPress={handlePostComment}
              />
            </Row>
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}

const styles = StyleSheet.create({
  markdownContainer: {
    width: "100%",
  },
  bold: {
    fontWeight: "700",
  },
  italic: {
    fontStyle: "italic",
  },
  inlineCode: {
    fontFamily: "monospace",
    fontSize: 12,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  link: {
    textDecorationLine: "underline",
  },
  listContainer: {
    paddingLeft: 4,
  },
  envelopeCard: {
    marginTop: 6,
  },
  shaList: {
    marginTop: 4,
  },
  commentCard: {
    marginVertical: 4,
  },
  commentContent: {
    padding: 8,
  },
  labelGroup: {
    marginVertical: 2,
  },
  readOnlyCard: {
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  composerForm: {
    padding: 8,
  },
  lifecycleContainer: {
    width: "100%",
  },
  sectionBlock: {
    paddingVertical: 4,
  },
  bodyCard: {
    marginVertical: 4,
  },
  bodyPadding: {
    padding: 8,
  },
  commentsCard: {
    marginTop: 8,
  },
  commentsList: {
    padding: 8,
  },
  newCommentBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.2)",
  },
});
