import React, { useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  SearchInput,
  usePluginTheme,
  useRpcQuery,
} from "paseo-plugin-helper/client";
import {
  permissionLoggerQuery,
  type PermissionAuditEntry,
  type PermissionDecision,
} from "../shared/contracts.js";

type DecisionFilter = "all" | PermissionDecision;

function formatTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}

function summarizeInput(input: unknown): string {
  if (input === null || input === undefined) return "—";
  if (typeof input === "string") return input.length > 120 ? `${input.slice(0, 120)}…` : input;
  try {
    const text = JSON.stringify(input);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  } catch {
    return "—";
  }
}

export function PermissionLoggerSurface() {
  const { colors } = usePluginTheme();
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<DecisionFilter>("all");

  const { data, isLoading, isError, refetch } = useRpcQuery(
    permissionLoggerQuery,
    { limit: 100 },
    { refetchInterval: 5000 },
  );

  const entries = useMemo(() => {
    const all = data?.entries ?? [];
    const needle = search.trim().toLowerCase();
    return all.filter((entry: PermissionAuditEntry) => {
      if (decision !== "all" && entry.decision !== decision) return false;
      if (!needle) return true;
      const haystack =
        `${entry.name} ${entry.kind} ${entry.agentId} ${entry.agentModel ?? ""} ${summarizeInput(entry.input)}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [data, search, decision]);

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

  return (
    <View style={{ gap: 12 }}>
      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search tool, agent, or arguments…"
        onClear={() => setSearch("")}
        testID="permission-logger-search"
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["all", "allow", "deny"] as DecisionFilter[]).map((value) => (
          <Button
            key={value}
            label={value === "all" ? "All" : value === "allow" ? "Allowed" : "Denied"}
            variant={decision === value ? "primary" : "secondary"}
            onPress={() => setDecision(value)}
          />
        ))}
      </View>
      <DataTable<PermissionAuditEntry>
        data={entries}
        keyExtractor={(item) => item.id}
        columns={[
          {
            key: "time",
            header: "Time",
            flex: 2,
            render: (item) => (
              <Text style={{ color: colors.foregroundMuted }}>{formatTime(item.timestamp)}</Text>
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
                  {summarizeInput(item.input)}
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
                label={item.decision === "allow" ? "Allowed" : "Denied"}
                variant={item.decision === "allow" ? "success" : "danger"}
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
    </View>
  );
}
