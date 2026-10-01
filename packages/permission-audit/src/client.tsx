import React, { useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ModalBody,
  SearchInput,
  usePluginTheme,
  useRpcQuery,
} from "paseo-plugin-helper/client";
import {
  permissionAuditQuery,
  type PermissionAuditEntry,
  type PermissionDecision,
  type PermissionQueryFilter,
} from "./shared.js";
import {
  filterAuditEntries,
  formatAuditTime,
  summarizeAuditInput,
  type DecisionFilter,
} from "./filter.js";

export type { PermissionAuditEntry, PermissionDecision, PermissionQueryFilter, DecisionFilter };
export { permissionAuditQuery, filterAuditEntries, formatAuditTime, summarizeAuditInput };
export type PermissionAuditVariant = "page" | "compact";

export interface UsePermissionAuditOptions {
  limit?: number;
  refreshIntervalMs?: number;
  enabled?: boolean;
}

export function usePermissionAudit(
  filter: Omit<PermissionQueryFilter, "limit"> & { limit?: number } = {},
  options: UsePermissionAuditOptions = {},
) {
  const { limit = 100, refreshIntervalMs = 5000, enabled = true } = options;
  const query = useRpcQuery(
    permissionAuditQuery,
    { ...filter, limit },
    { refetchInterval: refreshIntervalMs, enabled },
  );
  return query;
}

export interface PermissionAuditViewProps {
  agentId?: string;
  variant?: PermissionAuditVariant;
  showFilters?: boolean;
  limit?: number;
  refreshIntervalMs?: number;
}

const DECISION_FILTERS: DecisionFilter[] = ["all", "pending", "allow", "deny"];

function decisionLabel(value: DecisionFilter): string {
  switch (value) {
    case "pending":
      return "Pending";
    case "allow":
      return "Allowed";
    case "deny":
      return "Denied";
    default:
      return "All";
  }
}

export function PermissionAuditView({
  agentId,
  variant = "page",
  showFilters = true,
  limit = 100,
  refreshIntervalMs = 5000,
}: PermissionAuditViewProps) {
  const { colors } = usePluginTheme();
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<DecisionFilter>("all");

  const serverFilter = useMemo(
    () => (agentId ? { agentId } : {}),
    [agentId],
  );
  const { data, isLoading, isError, isRefetching, refetch } = usePermissionAudit(serverFilter, {
    limit,
    refreshIntervalMs,
  });

  const entries = useMemo(() => {
    const all = data?.entries ?? [];
    const scoped = agentId ? all.filter((entry) => entry.agentId === agentId) : all;
    return filterAuditEntries(scoped, decision, search);
  }, [data, agentId, decision, search]);

  if (isLoading) {
    return (
      <View style={{ padding: 24, alignItems: "center" }}>
        <ActivityIndicator />
        <Text style={{ color: colors.foregroundMuted, marginTop: 8 }}>Loading permission audit log…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Audit log unavailable"
        description="Could not load recent permission decisions."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  const filters = showFilters ? (
    <View style={{ gap: 12 }}>
      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search tool, agent, or arguments…"
        onClear={() => setSearch("")}
        testID="permission-audit-search"
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {DECISION_FILTERS.map((value) => (
          <Button
            key={value}
            label={decisionLabel(value)}
            variant={decision === value ? "primary" : "secondary"}
            onPress={() => setDecision(value)}
          />
        ))}
      </View>
    </View>
  ) : null;

  const table = (
    <DataTable<PermissionAuditEntry>
      data={entries}
      keyExtractor={(item) => item.id}
      columns={[
        {
          key: "time",
          header: "Time",
          flex: 2,
          render: (item) => (
            <Text style={{ color: colors.foregroundMuted }}>{formatAuditTime(item.timestamp)}</Text>
          ),
        },
        {
          key: "tool",
          header: "Permission",
          flex: 3,
          render: (item) => (
            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>{item.name}</Text>
              <Text style={{ color: colors.foregroundMuted }} numberOfLines={1}>
                {item.kind} · {item.agentId}
                {item.agentModel ? ` · ${item.agentModel}` : ""}
              </Text>
              <Text style={{ color: colors.foregroundMuted }} numberOfLines={1}>
                {summarizeAuditInput(item.input)}
              </Text>
            </View>
          ),
        },
        {
          key: "decision",
          header: "Decision",
          width: 110,
          align: "right",
          render: (item) => (
            <Badge
              label={
                item.decision === "pending"
                  ? "Pending"
                  : item.decision === "allow"
                    ? "Allowed"
                    : "Denied"
              }
              variant={
                item.decision === "pending"
                  ? "warning"
                  : item.decision === "allow"
                    ? "success"
                    : "danger"
              }
              dot
            />
          ),
        },
      ]}
      emptyState={
        <EmptyState
          icon="ShieldCheck"
          title="No permission decisions yet"
          description="Allowed and denied permission requests will appear here as agents run."
        />
      }
    />
  );

  if (variant === "compact") {
    return (
      <View style={{ gap: 12 }}>
        {filters}
        {table}
      </View>
    );
  }

  return (
    <ModalBody
      headerMode="pinned"
      header={filters}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      contentContainerStyle={{ gap: 12 }}
    >
      {table}
    </ModalBody>
  );
}
