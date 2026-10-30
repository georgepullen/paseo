import { useRpcMutation, useRpcQuery } from "paseo-plugin-helper/core";
import { useHostLayout, useHostTheme } from "paseo-plugin-helper/lifecycle";
import { HostButton, HostModalContent, HostScroll, HostStatusDot } from "paseo-plugin-helper/ui";
import type { StatusVariant } from "paseo-plugin-helper/shared";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, Modal, useToast } from "@getpaseo/plugin/client/react-native";
import React, { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import {
  ACTIVE_JOB_STATUSES,
  hostDashboardRpc,
  hostWakeRpc,
  hostsListRpc,
  jobsListRpc,
  type Compute,
  type HostRecord,
  type HostState,
  type JobRecord,
} from "../shared/registry";
import { HostForm } from "./host-form";

/**
 * Remote power dashboard: one card per host with a wake button and its status
 * — a 24h uptime strip, the wake board's reachability (microlink hosts), and
 * compute while the host is up. Hosts are added and edited in a modal.
 */

const DASHBOARD_POLL_MS = 15_000;
const ACTIVE_JOBS_POLL_MS = 2_000;
const IDLE_JOBS_POLL_MS = 15_000;
/** A failed wake stays visible on its host for this long. */
const RECENT_FAILURE_MS = 10 * 60_000;

function isActive(job: JobRecord): boolean {
  return (ACTIVE_JOB_STATUSES as readonly string[]).includes(job.status);
}

export function PowerSurface(_props: PluginSurfaceProps) {
  const { colors } = useHostTheme();
  const { compact } = useHostLayout();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HostRecord | null>(null);

  const hosts = useRpcQuery(hostsListRpc, {}, { refetchInterval: 60_000 });
  const jobsList = useRpcQuery(
    jobsListRpc,
    {},
    {
      refetchInterval: (query) =>
        (query.state.data?.jobs ?? []).some(isActive) ? ACTIVE_JOBS_POLL_MS : IDLE_JOBS_POLL_MS,
    },
  );
  const jobs = jobsList.data?.jobs ?? [];

  const wake = useRpcMutation(hostWakeRpc, {
    onSuccess: (result) => {
      if (result.alreadyUp) toast.show?.("Already awake");
      else if (result.error) toast.show?.(result.error.message);
      void jobsList.refetch();
    },
    onError: (cause) => toast.show?.(cause.message),
  });

  const openForm = (host: HostRecord | null) => {
    setEditing(host);
    setFormOpen(true);
  };

  return (
    <View style={{ flex: 1, minHeight: 0, width: "100%", backgroundColor: colors.surface0 }}>
      <HostScroll contentContainerStyle={{ padding: compact ? 16 : 32, alignItems: "center" }}>
        <View style={{ width: "100%", maxWidth: 600, gap: 16 }}>
          {hosts.error ? <Text style={{ color: colors.statusDanger, fontSize: 12 }}>{hosts.error.message}</Text> : null}

          {(hosts.data?.hosts ?? []).map((host) => (
            <HostPanel
              key={host.id}
              host={host}
              jobs={jobs.filter((job) => job.hostId === host.id)}
              pending={wake.isPending && wake.variables?.id === host.id}
              onWake={() => wake.mutate({ id: host.id })}
              onEdit={() => openForm(host)}
            />
          ))}

          {hosts.data !== undefined ? (
            <View style={{ alignItems: hosts.data.hosts.length === 0 ? "center" : "flex-start", gap: 8 }}>
              {hosts.data.hosts.length === 0 ? (
                <Text style={{ color: colors.foregroundMuted, fontSize: 13 }}>Add a machine to wake it from here.</Text>
              ) : null}
              <HostButton
                label="Add host"
                icon="Plus"
                size="sm"
                variant={hosts.data.hosts.length === 0 ? "primary" : "ghost"}
                onPress={() => openForm(null)}
              />
            </View>
          ) : null}
        </View>
      </HostScroll>

      <Modal
        title={editing !== null ? `Edit ${editing.name}` : "Add host"}
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) setFormOpen(false);
        }}
      >
        <HostModalContent>
          <HostForm
            key={editing?.id ?? "new"}
            editing={editing}
            onSaved={(message) => {
              setFormOpen(false);
              toast.show?.(message);
              void hosts.refetch();
            }}
            onCancel={() => setFormOpen(false)}
          />
        </HostModalContent>
      </Modal>
    </View>
  );
}

// --- Host panel --------------------------------------------------------------

const STATE_LABEL: Record<HostState, string> = { up: "Awake", down: "Asleep", unknown: "Unknown" };
const STATE_VARIANT: Record<HostState, StatusVariant> = { up: "success", down: "neutral", unknown: "warning" };

function HostPanel({
  host,
  jobs,
  pending,
  onWake,
  onEdit,
}: {
  host: HostRecord;
  jobs: JobRecord[];
  pending: boolean;
  onWake: () => void;
  onEdit: () => void;
}) {
  const { colors } = useHostTheme();
  const dashboard = useRpcQuery(hostDashboardRpc, { id: host.id }, { refetchInterval: DASHBOARD_POLL_MS });
  const state: HostState = dashboard.data?.state ?? "unknown";
  const activeJob = jobs.find(isActive);
  const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : undefined;
  const recentFailure =
    lastJob?.status === "failed" && lastJob.endedAt !== null && Date.now() - lastJob.endedAt < RECENT_FAILURE_MS
      ? lastJob
      : undefined;

  // Tick once a second only while a wake is in flight so the elapsed counter advances.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!activeJob) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [activeJob]);

  // A finished wake changes the host's state; refresh instead of waiting for the next poll.
  const activeJobId = activeJob?.jobId;
  useEffect(() => {
    if (activeJobId === undefined) void dashboard.refetch();
  }, [activeJobId]);

  const waking = activeJob !== undefined || pending;
  const windowSeconds = host.wakeWindowSeconds ?? 110;
  const subtitle = activeJob
    ? `Waking · ${Math.min(windowSeconds, Math.max(0, Math.round((Date.now() - activeJob.startedAt) / 1000)))}s of ${windowSeconds}s`
    : pending
      ? "Sending wake…"
      : dashboard.data === undefined
        ? "Checking…"
        : STATE_LABEL[state];

  return (
    <View
      style={{
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <HostStatusDot size="lg" variant={waking ? "warning" : STATE_VARIANT[state]} pulse={waking} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
            {host.name}
          </Text>
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>{subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${host.name}`}
          onPress={onEdit}
          hitSlop={8}
          style={{ padding: 6 }}
        >
          <Icon name="Pencil" size={14} color={colors.foregroundMuted} />
        </Pressable>
        <HostButton
          label={waking ? "Waking…" : "Wake"}
          icon="Power"
          variant="primary"
          onPress={onWake}
          loading={pending}
          disabled={waking}
        />
      </View>
      {recentFailure?.error && !waking ? (
        <Text style={{ color: colors.statusDanger, fontSize: 12, marginTop: 8 }}>
          Wake failed: {recentFailure.error.message}
        </Text>
      ) : null}

      {dashboard.data ? (
        <View style={{ marginTop: 16 }}>
          <UptimeSection state={state} strip={dashboard.data.uptime} />
          {dashboard.data.wakeBoard ? <WakeBoardSection board={dashboard.data.wakeBoard} /> : null}
          {dashboard.data.compute ? <ComputeSection compute={dashboard.data.compute} /> : null}
        </View>
      ) : null}
    </View>
  );
}

// --- Status sections -----------------------------------------------------------

type Strip = Array<number | null>;
type Health = "ok" | "warn" | "down" | "idle";

function percent(strip: Strip): number | null {
  const seen = strip.filter((value): value is number => value !== null);
  if (seen.length === 0) return null;
  return Math.round((seen.reduce((sum, value) => sum + value, 0) / seen.length) * 100);
}

function UptimeSection({ state, strip }: { state: HostState; strip: Strip }) {
  const { colors } = useHostTheme();
  const awake = percent(strip);
  return (
    <Section
      health={state === "up" ? "ok" : state === "down" ? "idle" : "warn"}
      title="Uptime"
      stat={awake !== null ? `${awake}% awake · 24h` : "collecting history"}
      divider={false}
    >
      <View style={{ gap: 6 }}>
        <StripView segments={strip} height={24} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {["−24h", "−12h", "now"].map((label) => (
            <Text key={label} style={{ color: colors.foregroundMuted, fontSize: 10 }}>
              {label}
            </Text>
          ))}
        </View>
      </View>
    </Section>
  );
}

function WakeBoardSection({ board }: { board: { online: boolean | null; rssi: number | null; strip: Strip } }) {
  const { colors } = useHostTheme();
  const reachable = percent(board.strip);
  const stat =
    board.online === false
      ? "offline"
      : [reachable !== null ? `${reachable}% reachable` : null, board.rssi !== null ? `${board.rssi} dBm` : null]
          .filter(Boolean)
          .join(" · ") || "no data yet";
  return (
    <Section
      health={board.online === true ? "ok" : board.online === false ? "down" : "warn"}
      title="Wake board"
      stat={stat}
    >
      <StripView segments={board.strip} height={10} downColor={colors.statusDanger} />
    </Section>
  );
}

function gb(mib: number | null): string {
  return mib === null ? "–" : (mib / 1024).toFixed(1);
}

function ratio(used: number | null, total: number | null): number {
  return used !== null && total !== null && total > 0 ? (used / total) * 100 : 0;
}

function joined(parts: Array<string | null | false>): string {
  return parts.filter(Boolean).join(" · ");
}

function ComputeSection({ compute }: { compute: Compute }) {
  const { colors } = useHostTheme();
  const gpu = compute.gpu;
  const stat = gpu
    ? joined([
        gpu.temp !== null && `${Math.round(gpu.temp)}°C`,
        gpu.power !== null && `${Math.round(gpu.power)} W`,
        gpu.util !== null && `util ${Math.round(gpu.util)}%`,
      ])
    : undefined;
  const footer = joined([
    gpu?.fan != null && `fan ${Math.round(gpu.fan)}%`,
    gpu?.procs != null && `${gpu.procs} GPU process${gpu.procs === 1 ? "" : "es"}`,
    compute.cores !== null && `${compute.cores} threads`,
  ]);
  return (
    <Section health="ok" title="Compute" stat={stat}>
      <View style={{ gap: 8 }}>
        {gpu ? (
          <Meter
            label="GPU"
            pct={ratio(gpu.vramUsedMiB, gpu.vramTotalMiB)}
            stat={`vram ${gb(gpu.vramUsedMiB)} / ${gb(gpu.vramTotalMiB)} GB`}
            warnHigh={false}
          />
        ) : null}
        {compute.cpu !== null ? (
          <Meter
            label="CPU"
            pct={compute.cpu}
            stat={joined([`${Math.round(compute.cpu)}%`, compute.load !== null && `load ${compute.load}`])}
          />
        ) : null}
        {compute.memTotalMiB !== null ? (
          <Meter
            label="RAM"
            pct={ratio(compute.memUsedMiB, compute.memTotalMiB)}
            stat={`${gb(compute.memUsedMiB)} / ${gb(compute.memTotalMiB)} GB`}
          />
        ) : null}
        {footer ? <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{footer}</Text> : null}
      </View>
    </Section>
  );
}

const HEALTH_ICON: Record<Health, string> = { ok: "CircleCheck", warn: "CircleAlert", down: "CircleX", idle: "Moon" };

function Section({
  title,
  stat,
  health,
  divider = true,
  children,
}: {
  title: string;
  stat?: string;
  health: Health;
  divider?: boolean;
  children: ReactNode;
}) {
  const { colors } = useHostTheme();
  const iconColor = {
    ok: colors.statusSuccess,
    warn: colors.statusWarning,
    down: colors.statusDanger,
    idle: colors.foregroundMuted,
  }[health];
  return (
    <View
      style={{
        gap: 10,
        paddingTop: divider ? 14 : 0,
        marginTop: divider ? 14 : 0,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={HEALTH_ICON[health]} size={16} color={iconColor} />
        <Text style={{ flex: 1, color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{title}</Text>
        {stat ? (
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }} numberOfLines={1}>
            {stat}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** 24h strip: green = awake/reachable, muted (or downColor) = down, track = no data. */
function StripView({ segments, height, downColor }: { segments: Strip; height: number; downColor?: string }) {
  const { colors, alpha } = useHostTheme();
  const { compact } = useHostLayout();
  const down = downColor ?? alpha(colors.foregroundMuted, 0.6);
  return (
    <View style={{ flexDirection: "row", gap: compact ? 1 : 2 }}>
      {segments.map((value, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height,
            borderRadius: 2,
            backgroundColor: value === null ? colors.surface2 : value > 0.02 ? colors.statusSuccess : down,
          }}
        />
      ))}
    </View>
  );
}

function Meter({
  label,
  pct,
  stat,
  warnHigh = true,
}: {
  label: string;
  pct: number;
  stat: string;
  warnHigh?: boolean;
}) {
  const { colors } = useHostTheme();
  const { compact } = useHostLayout();
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={{ width: 34, color: colors.foregroundMuted, fontSize: 11, fontWeight: "600" }}>{label}</Text>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: "hidden" }}>
        <View
          style={{
            width: `${clamped}%`,
            height: "100%",
            borderRadius: 3,
            backgroundColor: warnHigh && clamped >= 90 ? colors.statusWarning : colors.statusSuccess,
          }}
        />
      </View>
      <Text
        style={{ width: compact ? 120 : 170, textAlign: "right", color: colors.foregroundMuted, fontSize: 11 }}
        numberOfLines={1}
      >
        {stat}
      </Text>
    </View>
  );
}
