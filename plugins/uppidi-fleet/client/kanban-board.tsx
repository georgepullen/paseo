import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, Platform } from "react-native";
import {
  Badge,
  Button,
  Row,
  StatusDot,
  SearchInput,
  usePluginTheme,
} from "paseo-plugin-helper/client";
import type { UppidiIssue, AttentionLabel, KanbanColumnId } from "../shared/contracts.js";

export interface KanbanColumnDef {
  id: KanbanColumnId;
  title: string;
  stateLabel: string;
  tone: "neutral" | "accent" | "warning" | "success";
  description: string;
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  {
    id: "backlog",
    title: "Backlog / Triage",
    stateLabel: "state/0-triage",
    tone: "neutral",
    description: "Issues awaiting triage or in backlog",
  },
  {
    id: "in_progress",
    title: "In Progress",
    stateLabel: "state/1-wip",
    tone: "accent",
    description: "Work actively in progress",
  },
  {
    id: "review",
    title: "Review / Verify",
    stateLabel: "state/2-review",
    tone: "warning",
    description: "Work under review or ready to verify",
  },
  {
    id: "done",
    title: "Done",
    stateLabel: "state/4-done",
    tone: "success",
    description: "Work completed and verified",
  },
];

export function getIssueKanbanColumn(issue: UppidiIssue): KanbanColumnId {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  const normalized = labels.map((l) => String(l).trim().toLowerCase());

  if (
    issue.status === "Done" ||
    issue.state === "closed" ||
    normalized.some((l) => l === "state/4-done" || l.startsWith("state/4"))
  ) {
    return "done";
  }
  if (
    issue.status === "Review" ||
    normalized.some(
      (l) =>
        l === "state/2-review" ||
        l === "state/3-verify" ||
        l.startsWith("state/2") ||
        l.startsWith("state/3") ||
        l.startsWith("review/"),
    )
  ) {
    return "review";
  }
  if (
    issue.status === "In progress" ||
    normalized.some((l) => l === "state/1-wip" || l.startsWith("state/1"))
  ) {
    return "in_progress";
  }
  return "backlog";
}

const ATTENTION_CONFIG: Record<
  AttentionLabel,
  { label: string; variant: "neutral" | "info" | "warning" }
> = {
  "attention/0-orchestrator": { label: "Orchestrator", variant: "info" },
  "attention/1-agent": { label: "Agent", variant: "neutral" },
  "attention/2-user": { label: "You", variant: "warning" },
};

export interface KanbanTransitionAction {
  targetState: KanbanColumnId;
  label: string;
  icon: string;
  title: string;
}

export function getColumnTransitions(currentColumn: KanbanColumnId): KanbanTransitionAction[] {
  switch (currentColumn) {
    case "backlog":
      return [
        { targetState: "in_progress", label: "Start", icon: "Play", title: "Move to In Progress" },
        { targetState: "review", label: "Review", icon: "FileCheck", title: "Move to Review" },
      ];
    case "in_progress":
      return [
        { targetState: "backlog", label: "Backlog", icon: "ArrowLeft", title: "Move to Backlog" },
        { targetState: "review", label: "Review", icon: "ArrowRight", title: "Move to Review" },
      ];
    case "review":
      return [
        { targetState: "in_progress", label: "WIP", icon: "ArrowLeft", title: "Return to In Progress" },
        { targetState: "done", label: "Done", icon: "Check", title: "Mark as Done" },
      ];
    case "done":
      return [
        { targetState: "backlog", label: "Reopen", icon: "RotateCcw", title: "Reopen into Backlog" },
        { targetState: "in_progress", label: "WIP", icon: "Play", title: "Move to In Progress" },
      ];
  }
}

export interface KanbanCardProps {
  issue: UppidiIssue;
  columnId: KanbanColumnId;
  onSelect?: (issueNumber: number) => void;
  onTransition?: (issue: UppidiIssue, targetState: KanbanColumnId) => void | Promise<void>;
  isTransitioning?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: any) => void;
  onDragEnd?: (e: any) => void;
}

export function KanbanCard({
  issue,
  columnId,
  onSelect,
  onTransition,
  isTransitioning = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: KanbanCardProps) {
  const { colors, typography } = usePluginTheme();
  const transitions = getColumnTransitions(columnId);
  const attention = ATTENTION_CONFIG[issue.attention] ?? { label: "Agent", variant: "neutral" };
  const isWeb = Platform.OS === "web";
  const [internalDragging, setInternalDragging] = useState(false);
  const draggingActive = isDragging || internalDragging;

  const handleDragStart = (e: any) => {
    setInternalDragging(true);
    if (e?.dataTransfer) {
      try {
        e.dataTransfer.setData("text/plain", String(issue.number));
        e.dataTransfer.setData("application/json", JSON.stringify(issue));
        e.dataTransfer.effectAllowed = "move";
      } catch {
        // ignore in environments with restricted dataTransfer
      }
    }
    onDragStart?.(e);
  };

  const handleDragEnd = (e: any) => {
    setInternalDragging(false);
    onDragEnd?.(e);
  };

  const webDragProps: Record<string, any> = isWeb
    ? {
        draggable: true,
        onDragStart: handleDragStart,
        onDragEnd: handleDragEnd,
      }
    : {};

  return (
    <View
      testID={`kanban-card-${issue.number}`}
      {...webDragProps}
      style={{
        backgroundColor: colors.surface0 ?? "#18181b",
        borderColor: colors.border ?? "#3f3f46",
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        gap: 8,
        opacity: draggingActive ? 0.6 : 1,
        ...(isWeb ? ({ cursor: "grab" } as any) : {}),
      }}
    >
      {/* Top row: Issue number, repo, attention */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Row gap="xs" align="center">
          <Pressable
            onPress={() => onSelect?.(issue.number)}
            accessibilityRole="button"
            accessibilityLabel={`Open issue #${issue.number}`}
          >
            <Text
              style={{
                color: colors.accent ?? "#38bdf8",
                fontWeight: "700",
                fontSize: 12,
              }}
            >
              #{issue.number}
            </Text>
          </Pressable>
          <Badge label={issue.repo} variant="neutral" size="sm" />
        </Row>
        <Badge label={attention.label} variant={attention.variant} size="sm" />
      </View>

      {/* Title */}
      <Pressable
        onPress={() => onSelect?.(issue.number)}
        accessibilityRole="button"
        accessibilityLabel={`View details for #${issue.number} ${issue.title}`}
      >
        <Text
          numberOfLines={3}
          style={{
            color: colors.foreground ?? "#f4f4f5",
            fontWeight: "600",
            fontSize: 13,
            lineHeight: 18,
          }}
        >
          {issue.title}
        </Text>
      </Pressable>

      {/* Meta tags (branch, comments) */}
      {(issue.branch || (issue.comments !== undefined && issue.comments > 0)) && (
        <Row gap="xs" align="center" wrap>
          {issue.branch && (
            <Badge label={issue.branch} variant="neutral" size="sm" />
          )}
          {issue.comments !== undefined && issue.comments > 0 && (
            <Text style={{ color: colors.foregroundMuted ?? "#a1a1aa", ...typography.caption, fontSize: 11 }}>
              💬 {issue.comments}
            </Text>
          )}
        </Row>
      )}

      {/* 1-Click State Transition Buttons */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 6,
          marginTop: 2,
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: colors.border ?? "#3f3f46",
        }}
      >
        {transitions.map((t) => (
          <Button
            key={t.targetState}
            label={t.label}
            icon={t.icon}
            size="sm"
            variant="secondary"
            disabled={isTransitioning}
            accessibilityLabel={`Move #${issue.number} to ${t.title}`}
            onPress={() => onTransition?.(issue, t.targetState)}
          />
        ))}
      </View>
    </View>
  );
}

export interface UppidiFleetKanbanBoardProps {
  issues: UppidiIssue[];
  selectedRepo?: string;
  onSelectIssue?: (issueNumber: number) => void;
  onTransitionIssue?: (issue: UppidiIssue, targetState: KanbanColumnId) => void | Promise<void>;
  filterQuery?: string;
  onFilterQueryChange?: (query: string) => void;
  isLoading?: boolean;
}

export function UppidiFleetKanbanBoard({
  issues,
  selectedRepo,
  onSelectIssue,
  onTransitionIssue,
  filterQuery: externalFilterQuery,
  onFilterQueryChange,
  isLoading = false,
}: UppidiFleetKanbanBoardProps) {
  const { colors, typography } = usePluginTheme();
  const [internalQuery, setInternalQuery] = useState("");
  const [transitioningIssueId, setTransitioningIssueId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<KanbanColumnId | null>(null);
  const isWeb = Platform.OS === "web";

  const query = externalFilterQuery !== undefined ? externalFilterQuery : internalQuery;
  const setQuery = onFilterQueryChange ?? setInternalQuery;

  // Filter issues by search query and repository
  const filteredIssues = useMemo(() => {
    let list = Array.isArray(issues) ? issues : [];
    if (selectedRepo && selectedRepo !== "all") {
      const targetRepo = selectedRepo.includes("/") ? selectedRepo.split("/")[1] : selectedRepo;
      list = list.filter((i) => i.repo === targetRepo || i.repo === selectedRepo);
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) => {
      const matchNum = String(i.number).includes(q) || `#${i.number}`.includes(q);
      const matchTitle = (i.title || "").toLowerCase().includes(q);
      const matchRepo = (i.repo || "").toLowerCase().includes(q);
      const matchLabel = (i.labels || []).some((l) => l.toLowerCase().includes(q));
      return matchNum || matchTitle || matchRepo || matchLabel;
    });
  }, [issues, selectedRepo, query]);

  // Group issues into the 4 columns
  const issuesByColumn = useMemo(() => {
    const map: Record<KanbanColumnId, UppidiIssue[]> = {
      backlog: [],
      in_progress: [],
      review: [],
      done: [],
    };
    for (const issue of filteredIssues) {
      const col = getIssueKanbanColumn(issue);
      map[col].push(issue);
    }
    return map;
  }, [filteredIssues]);

  const handleTransition = async (issue: UppidiIssue, targetState: KanbanColumnId) => {
    if (!onTransitionIssue) return;
    setTransitioningIssueId(issue.number);
    try {
      await onTransitionIssue(issue, targetState);
    } finally {
      setTransitioningIssueId(null);
    }
  };

  const handleColumnDragOver = (e: any, colId: KanbanColumnId) => {
    e.preventDefault?.();
    if (e?.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleColumnDragEnter = (e: any, colId: KanbanColumnId) => {
    e.preventDefault?.();
    setDragOverColumn(colId);
  };

  const handleColumnDragLeave = (e: any, colId: KanbanColumnId) => {
    e.preventDefault?.();
    setDragOverColumn((current) => (current === colId ? null : current));
  };

  const handleColumnDrop = async (e: any, targetColId: KanbanColumnId) => {
    e.preventDefault?.();
    setDragOverColumn(null);

    let issueToTransition: UppidiIssue | undefined;
    if (e?.dataTransfer) {
      try {
        const jsonStr = e.dataTransfer.getData?.("application/json");
        if (jsonStr) {
          issueToTransition = JSON.parse(jsonStr);
        }
      } catch {
        // Fallback to text/plain issue number
      }

      if (!issueToTransition) {
        const numStr = e.dataTransfer.getData?.("text/plain");
        if (numStr) {
          const issueNum = parseInt(numStr, 10);
          issueToTransition = issues.find((i) => i.number === issueNum);
        }
      }
    }

    if (issueToTransition) {
      const fullIssue = issues.find((i) => i.number === issueToTransition?.number) ?? issueToTransition;
      const currentColumn = getIssueKanbanColumn(fullIssue);
      if (currentColumn !== targetColId) {
        await handleTransition(fullIssue, targetColId);
      }
    }
  };

  return (
    <View style={{ width: "100%", gap: 12 }} testID="kanban-board-container">
      {/* Top Toolbar: Search + Column Metrics Summary */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <View style={{ flex: 1, minWidth: 220, maxWidth: 380 }}>
          <SearchInput
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            placeholder="Filter board cards..."
            height={28}
          />
        </View>

        <Row gap="xs" align="center" wrap>
          {KANBAN_COLUMNS.map((col) => (
            <Row
              key={col.id}
              gap="xs"
              align="center"
              style={{
                backgroundColor: colors.surface1 ?? "#27272a",
                borderColor: colors.border ?? "#3f3f46",
                borderWidth: 1,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <StatusDot variant={col.tone === "accent" ? "info" : col.tone} />
              <Text style={{ color: colors.foregroundMuted ?? "#a1a1aa", ...typography.caption, fontSize: 11 }}>
                {col.title}:
              </Text>
              <Text style={{ color: colors.foreground ?? "#f4f4f5", fontWeight: "700", fontSize: 11 }}>
                {issuesByColumn[col.id].length}
              </Text>
            </Row>
          ))}
        </Row>
      </View>

      {/* Horizontal ScrollView across the 4 Columns */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={{
          flexDirection: "row",
          gap: 12,
          paddingBottom: 16,
          paddingTop: 4,
        }}
        testID="kanban-board-scroll"
      >
        {KANBAN_COLUMNS.map((col) => {
          const colIssues = issuesByColumn[col.id];
          const isOver = dragOverColumn === col.id;

          const webColumnProps: Record<string, any> = isWeb
            ? {
                onDragOver: (e: any) => handleColumnDragOver(e, col.id),
                onDragEnter: (e: any) => handleColumnDragEnter(e, col.id),
                onDragLeave: (e: any) => handleColumnDragLeave(e, col.id),
                onDrop: (e: any) => handleColumnDrop(e, col.id),
              }
            : {};

          return (
            <View
              key={col.id}
              testID={`kanban-column-${col.id}`}
              {...webColumnProps}
              style={{
                width: 290,
                minWidth: 260,
                backgroundColor: isOver
                  ? (colors.surface2 ?? "#333338")
                  : (colors.surface1 ?? "#27272a"),
                borderColor: isOver
                  ? (colors.accent ?? "#38bdf8")
                  : (colors.border ?? "#3f3f46"),
                borderWidth: isOver ? 2 : 1,
                borderStyle: isOver ? "dashed" : "solid",
                borderRadius: 8,
                flexDirection: "column",
                flexShrink: 0,
                padding: isOver ? 9 : 10,
              }}
            >
              {/* Column Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: 8,
                  marginBottom: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border ?? "#3f3f46",
                }}
              >
                <Row align="center" gap="xs">
                  <StatusDot variant={col.tone === "accent" ? "info" : col.tone} />
                  <Text style={{ color: colors.foreground ?? "#f4f4f5", fontWeight: "600", fontSize: 13 }}>
                    {col.title}
                  </Text>
                </Row>
                <Badge label={String(colIssues.length)} variant="neutral" size="sm" />
              </View>

              {/* Column Body: Vertically scrollable within column */}
              <ScrollView
                showsVerticalScrollIndicator={true}
                style={{ flex: 1, maxHeight: 600 }}
                contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
                testID={`kanban-column-body-${col.id}`}
              >
                {colIssues.length === 0 ? (
                  <View
                    style={{
                      padding: 24,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: colors.foregroundMuted ?? "#a1a1aa",
                        ...typography.caption,
                        fontSize: 12,
                      }}
                    >
                      No issues in this column
                    </Text>
                  </View>
                ) : (
                  colIssues.map((issue) => (
                    <KanbanCard
                      key={issue.number}
                      issue={issue}
                      columnId={col.id}
                      onSelect={onSelectIssue}
                      onTransition={handleTransition}
                      isTransitioning={transitioningIssueId === issue.number}
                    />
                  ))
                )}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
