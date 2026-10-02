import React, { useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRpcQuery } from "paseo-plugin-helper/client";
import {
  HostBadge,
  HostButton,
  HostDataTable,
  HostEmptyState,
  HostLayoutProvider,
  HostScroll,
  HostSearchInput,
  HostThemeProvider,
  useHostTheme,
} from "paseo-plugin-helper/ui";
import type { PluginTheme, ResponsiveLayout } from "paseo-plugin-helper/shared";
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
  /**
   * Host theme for this surface. The host passes it through the surface
   * registration props; when present the view wraps its content in
   * `HostThemeProvider` so every `ui/` adapter paints with host colors.
   * When absent (tests, standalone rendering) adapters fall back to the
   * neutral host palette.
   */
  theme?: PluginTheme;
  /** Host layout descriptor for this surface. */
  layout?: ResponsiveLayout;
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

/**
 * Permission audit view migrated off the deprecated `client/` UI kit
 * (paseo#847 Phase 3): `ModalBody` → `HostScroll` (the sidebar host supplies
 * no scroller, so the view owns exactly one), `DataTable` → `HostDataTable`,
 * and every other primitive to its `ui/` adapter. Scroll ownership stays
 * explicit: the page variant renders a single `HostScroll`; the compact
 * variant renders no scroller and leaves scrolling to the surrounding host
 * surface.
 */
export function PermissionAuditView({
  agentId,
  variant = "page",
  showFilters = true,
  limit = 100,
  refreshIntervalMs = 5000,
  theme,
  layout,
}: PermissionAuditViewProps) {
  const content = (
    <PermissionAuditViewContent
      agentId={agentId}
      variant={variant}
      showFilters={showFilters}
      limit={limit}
      refreshIntervalMs={refreshIntervalMs}
    />
  );
  if (!theme) {
    return content;
  }
  return (
    <HostThemeProvider theme={theme}>
      <HostLayoutProvider layout={layout ?? { compact: false, platform: "web" }}>
        {content}
      </HostLayoutProvider>
    </HostThemeProvider>
  );
}

function PermissionAuditViewContent({
  agentId,
  variant = "page",
  showFilters = true,
  limit = 100,
  refreshIntervalMs = 5000,
}: Omit<PermissionAuditViewProps, "theme" | "layout">) {
  const { colors } = useHostTheme();
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<DecisionFilter>("all");

  const serverFilter = useMemo(
    () => (agentId ? { agentId } : {}),
    [agentId],
  );
  const { data, isLoading, isError, refetch } = usePermissionAudit(serverFilter, {
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
      <HostEmptyState
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
      <HostSearchInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search tool, agent, or arguments…"
        onClear={() => setSearch("")}
        testID="permission-audit-search"
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {DECISION_FILTERS.map((value) => (
          <HostButton
            key={value}
            label={decisionLabel(value)}
            size="sm"
            variant={decision === value ? "primary" : "secondary"}
            onPress={() => setDecision(value)}
          />
        ))}
      </View>
    </View>
  ) : null;

  const table = (
    <HostDataTable<PermissionAuditEntry>
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
            <HostBadge
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
        <HostEmptyState
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
    <HostScroll contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
      {filters}
      {table}
    </HostScroll>
  );
}
