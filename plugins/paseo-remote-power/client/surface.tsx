import { useRpcMutation, useRpcQuery } from "paseo-plugin-helper/core";
import { useHostTheme } from "paseo-plugin-helper/lifecycle";
import {
  HostBadge,
  HostButton,
  HostCard,
  HostEmptyState,
  HostFormRow,
  HostModalContent,
  HostRow,
  HostScroll,
  HostSectionHeader,
  HostSelect,
  HostStack,
  HostStatusDot,
  HostTextInput,
} from "paseo-plugin-helper/ui";
import type { StatusVariant } from "paseo-plugin-helper/shared";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  ACTIVE_JOB_STATUSES,
  hostStatusRpc,
  hostWakeRpc,
  hostsAddRpc,
  hostsListRpc,
  hostsRemoveRpc,
  hostsUpdateRpc,
  jobsListRpc,
  type HostRecord,
  type JobRecord,
  type JobStatus,
  type HostState,
  type WakeTransport,
} from "../shared/registry";

/**
 * Hosts roster for remote power control: per-host status dots (up / down /
 * waking / unknown, polled), wake buttons with live job progress, add/edit/
 * remove forms, and the recent wake-jobs list. Built on the helper UI
 * adapters; the host owns theme, scroll, and modal frames.
 */

const STATUS_POLL_MS = 15_000;
const JOBS_POLL_MS = 2_000;

interface TransportDraft {
  type: "http" | "wol" | "command";
  url: string;
  tokenRef: string;
  mac: string;
  host: string;
  command: string;
  args: string;
}

function emptyDraft(): TransportDraft {
  return { type: "http", url: "", tokenRef: "", mac: "", host: "", command: "", args: "" };
}

function draftToTransport(draft: TransportDraft): WakeTransport | null {
  switch (draft.type) {
    case "http":
      return draft.url.trim().length > 0
        ? { type: "http", url: draft.url.trim(), ...(draft.tokenRef.trim().length > 0 ? { tokenRef: draft.tokenRef.trim() } : {}) }
        : null;
    case "wol":
      if (draft.mac.trim().length === 0) return null;
      return { type: "wol", mac: draft.mac.trim(), ...(draft.host.trim().length > 0 ? { host: draft.host.trim() } : {}) };
    case "command":
      if (draft.command.trim().length === 0) return null;
      return {
        type: "command",
        command: draft.command.trim(),
        ...(draft.args.trim().length > 0
          ? { args: draft.args.split(",").map((arg) => arg.trim()).filter((arg) => arg.length > 0) }
          : {}),
      };
  }
}

function transportToDraft(transport: WakeTransport): TransportDraft {
  const base = emptyDraft();
  base.type = transport.type;
  if (transport.type === "http") {
    base.url = transport.url;
    base.tokenRef = transport.tokenRef ?? "";
  } else if (transport.type === "wol") {
    base.mac = transport.mac;
    base.host = transport.host ?? "";
  } else {
    base.command = transport.command;
    base.args = (transport.args ?? []).join(", ");
  }
  return base;
}

function toTransportType(value: string): TransportDraft["type"] {
  return value === "wol" || value === "command" || value === "http" ? value : "http";
}

function stateVariant(state: HostState, waking: boolean): StatusVariant {
  if (waking) return "warning";
  switch (state) {
    case "up":
      return "success";
    case "down":
      return "danger";
    case "unknown":
      return "neutral";
  }
}

const STATE_LABEL: Record<HostState, string> = { up: "up", down: "down", unknown: "unknown" };

function formatElapsed(startedAt: number, nowMs: number): string {
  return `${Math.max(0, Math.round((nowMs - startedAt) / 1000))}s`;
}

export function PowerSurface(_props: PluginSurfaceProps) {
  const { colors } = useHostTheme();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HostRecord | null>(null);

  const hosts = useRpcQuery(hostsListRpc, {}, { refetchInterval: STATUS_POLL_MS });
  const jobs = useRpcQuery(jobsListRpc, {}, { refetchInterval: JOBS_POLL_MS });

  const wake = useRpcMutation(hostWakeRpc, {
    onSuccess: (result) => {
      if (result.alreadyUp) toast.show?.("Host is already up");
      else if (result.error) toast.show?.(result.error.message);
      else toast.show?.(`Wake started (${result.jobId})`);
      void jobs.refetch();
    },
    onError: (cause) => toast.show?.(cause.message),
  });
  const remove = useRpcMutation(hostsRemoveRpc, {
    onSuccess: () => {
      toast.show?.("Host removed");
      void hosts.refetch();
    },
  });

  const [pendingRemove, setPendingRemove] = useState<HostRecord | null>(null);

  return (
    <View style={{ flex: 1, minHeight: 0, width: "100%", backgroundColor: colors.surface0 }}>
      <HostScroll contentContainerStyle={{ padding: 12, gap: 12 }}>
        <HostRow align="center" justify="between">
          <HostSectionHeader title="Hosts" count={hosts.data?.hosts.length} />
          <HostButton
            label="Add host"
            variant="primary"
            size="sm"
            icon="Plus"
            onPress={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
        </HostRow>

        {hosts.isPending ? <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>Loading hosts…</Text> : null}
        {hosts.error ? <Text style={{ color: colors.statusDanger, fontSize: 12 }}>{hosts.error.message}</Text> : null}
        {hosts.data !== undefined && hosts.data.hosts.length === 0 ? (
          <HostCard>
            <HostEmptyState
              icon="Power"
              title="No hosts yet"
              description="Add a machine to wake it from here, or let agents do it with the power_wake tool."
            />
          </HostCard>
        ) : null}

        <HostStack gap={8}>
          {(hosts.data?.hosts ?? []).map((host) => (
            <HostRow key={host.id} align="center">
              <HostEntry
                host={host}
                jobs={(jobs.data?.jobs ?? []).filter((job) => job.hostId === host.id)}
                onEdit={() => {
                  setEditing(host);
                  setFormOpen(true);
                }}
                onRemove={() => setPendingRemove(host)}
                onWake={() => wake.mutate({ id: host.id })}
                wakePending={wake.isPending && wake.variables?.id === host.id}
              />
            </HostRow>
          ))}
        </HostStack>

        <HostSectionHeader title="Wake jobs" count={(jobs.data?.jobs ?? []).length} />
        <JobsList jobs={jobs.data?.jobs ?? []} />
      </HostScroll>

      <Modal
        title={editing !== null ? `Edit host: ${editing.name}` : "Add host"}
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) setFormOpen(false);
        }}
      >
        <HostModalContent>
          <HostForm
            key={editing?.id ?? "new"}
            editing={editing}
            onSaved={(saved) => {
              setFormOpen(false);
              toast.show?.(saved);
              void hosts.refetch();
            }}
            onCancel={() => setFormOpen(false)}
            onError={(message) => toast.show?.(message)}
          />
        </HostModalContent>
      </Modal>

      <Modal
        title={`Remove ${pendingRemove?.name ?? ""}`}
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <HostModalContent>
          <Text selectable style={{ color: colors.foreground, fontSize: 13 }}>
            Remove '{pendingRemove?.name}' from the roster? Wake jobs already recorded are kept.
          </Text>
          <HostRow gap={8} align="center">
            <HostButton
              label="Remove"
              variant="danger"
              onPress={() => {
                if (pendingRemove !== null) remove.mutate({ id: pendingRemove.id });
                setPendingRemove(null);
              }}
            />
            <HostButton label="Cancel" variant="ghost" onPress={() => setPendingRemove(null)} />
          </HostRow>
        </HostModalContent>
      </Modal>
    </View>
  );
}

function HostEntry({
  host,
  jobs,
  onEdit,
  onRemove,
  onWake,
  wakePending,
}: {
  host: HostRecord;
  jobs: JobRecord[];
  onEdit: () => void;
  onRemove: () => void;
  onWake: () => void;
  wakePending: boolean;
}) {
  const { colors } = useHostTheme();
  const status = useRpcQuery(hostStatusRpc, { id: host.id }, { refetchInterval: STATUS_POLL_MS, staleTime: STATUS_POLL_MS });
  const state: HostState = status.data?.state ?? "unknown";
  const activeJob = jobs.find((job) => (ACTIVE_JOB_STATUSES as readonly string[]).includes(job.status));
  // Heartbeat re-render only while a wake is in flight, so the progress line
  // advances once a second without re-rendering idle rows.
  const [, setHeartbeat] = useState(0);
  useEffect(() => {
    if (!activeJob) return;
    const timer = setInterval(() => setHeartbeat((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [activeJob]);

  const windowSeconds = host.wakeWindowSeconds ?? 110;
  const progress =
    activeJob !== undefined
      ? `${activeJob.status} · ${formatElapsed(activeJob.startedAt, Date.now())} of ${windowSeconds}s window`
      : null;

  return (
    <HostCard>
      <HostRow align="center" gap={8}>
        <HostStatusDot variant={stateVariant(state, activeJob !== undefined)} pulse={activeJob !== undefined} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>{host.name}</Text>
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
            {activeJob !== undefined ? progress : `${STATE_LABEL[state]}${status.isFetching ? " · checking…" : ""}`}
          </Text>
        </View>
        <HostButton label="Wake" variant="primary" size="sm" onPress={onWake} loading={wakePending} disabled={activeJob !== undefined} />
      </HostRow>
      {activeJob?.error ? (
        <Text style={{ color: colors.statusDanger, fontSize: 12 }}>{activeJob.error.message}</Text>
      ) : null}
      {jobs.length > 0 ? (
        <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
          last job: {jobs[jobs.length - 1].status}
          {jobs[jobs.length - 1].endedAt !== null ? " (finished)" : ""}
        </Text>
      ) : null}
      <HostRow gap={8}>
        <HostButton label="Check now" size="sm" variant="ghost" onPress={() => void status.refetch()} />
        <HostButton label="Edit" size="sm" variant="ghost" onPress={onEdit} />
        <HostButton label="Remove" size="sm" variant="danger" onPress={onRemove} />
      </HostRow>
    </HostCard>
  );
}

const JOB_STATUS_VARIANT: Record<JobStatus, StatusVariant> = {
  starting: "neutral",
  waking: "warning",
  verifying: "warning",
  up: "success",
  failed: "danger",
};

function JobsList({ jobs }: { jobs: JobRecord[] }) {
  const { colors } = useHostTheme();
  if (jobs.length === 0) {
    return (
      <HostCard>
        <HostEmptyState icon="History" title="No wake jobs yet" description="Wake requests and their outcomes appear here." />
      </HostCard>
    );
  }
  return (
    <HostStack gap={8}>
      {jobs
        .slice(-10)
        .reverse()
        .map((job) => (
        <HostCard key={job.jobId}>
          <HostRow align="center" gap={8}>
            <HostStatusDot variant={JOB_STATUS_VARIANT[job.status]} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 13 }}>
                {job.jobId} · {job.status}
              </Text>
              <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
                started {new Date(job.startedAt).toLocaleTimeString()}
                {job.endedAt !== null ? ` · finished ${new Date(job.endedAt).toLocaleTimeString()}` : " · running"}
              </Text>
            </View>
            <HostBadge label={job.status} variant={JOB_STATUS_VARIANT[job.status]} />
          </HostRow>
          {job.error !== null ? <Text style={{ color: colors.statusDanger, fontSize: 12 }}>{job.error.message}</Text> : null}
          {job.log.length > 0 ? (
            <Text selectable style={{ color: colors.foregroundMuted, fontSize: 11 }}>
              {job.log[job.log.length - 1]}
            </Text>
          ) : null}
        </HostCard>
      ))}
    </HostStack>
  );
}

function HostForm({
  editing,
  onSaved,
  onCancel,
  onError,
}: {
  editing: HostRecord | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const { colors } = useHostTheme();
  const [name, setName] = useState(editing?.name ?? "");
  const [sshTarget, setSshTarget] = useState(editing?.sshTarget ?? "");
  const [command, setCommand] = useState(editing?.statusCommand?.command ?? "");
  const [commandArgs, setCommandArgs] = useState((editing?.statusCommand?.args ?? []).join(", "));
  const [windowText, setWindowText] = useState(
    editing?.wakeWindowSeconds !== undefined ? String(editing.wakeWindowSeconds) : "",
  );
  const [token, setToken] = useState("");
  const [tokenRef, setTokenRef] = useState("");
  const [transports, setTransports] = useState<TransportDraft[]>(
    editing !== null && editing.wakeTransports.length > 0
      ? editing.wakeTransports.map(transportToDraft)
      : [emptyDraft()],
  );

  const add = useRpcMutation(hostsAddRpc, {
    onSuccess: (result) => {
      if (!result.saved) {
        onError(result.error ?? "could not save host");
        return;
      }
      onSaved(`Host '${result.host?.name}' saved`);
    },
    onError: (cause) => onError(cause.message),
  });
  const update = useRpcMutation(hostsUpdateRpc, {
    onSuccess: (result) => {
      if (!result.saved) {
        onError(result.error ?? "could not save host");
        return;
      }
      onSaved(`Host '${result.host?.name}' updated`);
    },
    onError: (cause) => onError(cause.message),
  });

  const parsedWindow = Number.parseInt(windowText, 10);
  const buildTransports = (): WakeTransport[] => {
    const built: WakeTransport[] = [];
    for (const draft of transports) {
      const transport = draftToTransport(draft);
      if (transport !== null) built.push(transport);
    }
    return built;
  };

  const save = () => {
    const builtTransports = buildTransports();
    if (name.trim().length === 0) {
      onError("a host name is required");
      return;
    }
    if (builtTransports.length === 0) {
      onError("at least one complete wake transport is required");
      return;
    }
    const shared = {
      name: name.trim(),
      ...(sshTarget.trim().length > 0 ? { sshTarget: sshTarget.trim() } : {}),
      ...(command.trim().length > 0
        ? {
            statusCommand: {
              command: command.trim(),
              ...(commandArgs.trim().length > 0
                ? { args: commandArgs.split(",").map((arg) => arg.trim()).filter((arg) => arg.length > 0) }
                : {}),
            },
          }
        : {}),
      ...(Number.isFinite(parsedWindow) ? { wakeWindowSeconds: parsedWindow } : {}),
      wakeTransports: builtTransports,
      ...(token.trim().length > 0 ? { token: token.trim() } : {}),
      ...(tokenRef.trim().length > 0 ? { tokenRef: tokenRef.trim() } : {}),
    };
    if (editing !== null) update.mutate({ id: editing.id, ...shared });
    else add.mutate(shared);
  };

  return (
    <HostStack gap={12}>
      <HostFormRow label="Name" description="Shown in the roster and to agents.">
        <HostTextInput value={name} onChangeText={setName} placeholder="build-box" />
      </HostFormRow>
      <HostFormRow label="ssh target" description="ssh alias or user@host used for reachability probes (BatchMode key auth).">
        <HostTextInput value={sshTarget} onChangeText={setSshTarget} placeholder="build.example.net" autoCapitalize="none" />
      </HostFormRow>
      <HostFormRow label="status command" description="Optional liveness probe run on this machine; exit 0 means up. Wins over ssh.">
        <HostTextInput value={command} onChangeText={setCommand} placeholder="systemctl is-active" autoCapitalize="none" />
        <HostTextInput value={commandArgs} onChangeText={setCommandArgs} placeholder="sshd.service (comma-separated args)" autoCapitalize="none" />
      </HostFormRow>
      <HostFormRow label="Wake window (seconds)" description="How long to wait for reachability after a wake. Default 110.">
        <HostTextInput value={windowText} onChangeText={setWindowText} placeholder="110" keyboardType="number-pad" />
      </HostFormRow>

      <HostSectionHeader title="Wake transports" />
      <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
        Tried in order; the first success starts reachability verification.
      </Text>
      <HostStack gap={8}>
        {transports.map((draft, index) => (
          <HostCard key={index}>
            <HostFormRow label={`Transport ${index + 1}`}>
              <HostSelect
                value={draft.type}
                onValueChange={(value) =>
                  setTransports((prev) => prev.map((entry, i) => (i === index ? { ...emptyDraft(), type: toTransportType(value) } : entry)))
                }
                options={[
                  { label: "http POST", value: "http" },
                  { label: "Wake-on-LAN", value: "wol" },
                  { label: "Custom command", value: "command" },
                ]}
              />
            </HostFormRow>
            {draft.type === "http" ? (
              <>
                <HostFormRow label="URL" description="Endpoint that receives the POST wake.">
                  <HostTextInput value={draft.url} onChangeText={(text) => setField(index, "url", text)} placeholder="http://192.0.2.10/wake" autoCapitalize="none" />
                </HostFormRow>
                <HostFormRow label="Token ref" description="Names the bearer token in the plugin state dir (sent as Authorization header).">
                  <HostTextInput value={draft.tokenRef} onChangeText={(text) => setField(index, "tokenRef", text)} placeholder="build-box-wake" autoCapitalize="none" />
                </HostFormRow>
              </>
            ) : null}
            {draft.type === "wol" ? (
              <>
                <HostFormRow label="MAC address">
                  <HostTextInput value={draft.mac} onChangeText={(text) => setField(index, "mac", text)} placeholder="00:11:22:33:44:55" autoCapitalize="none" />
                </HostFormRow>
                <HostFormRow label="Target host" description="Optional subnet-directed or relay address; default is broadcast.">
                  <HostTextInput value={draft.host} onChangeText={(text) => setField(index, "host", text)} placeholder="192.0.2.255" autoCapitalize="none" />
                </HostFormRow>
              </>
            ) : null}
            {draft.type === "command" ? (
              <>
                <HostFormRow label="Command" description="Runs on this machine (the daemon host). Config is trusted.">
                  <HostTextInput value={draft.command} onChangeText={(text) => setField(index, "command", text)} placeholder="/usr/local/bin/wake-box" autoCapitalize="none" />
                </HostFormRow>
                <HostFormRow label="Arguments" description="Comma-separated.">
                  <HostTextInput value={draft.args} onChangeText={(text) => setField(index, "args", text)} placeholder="--port 9" autoCapitalize="none" />
                </HostFormRow>
              </>
            ) : null}
            <HostRow>
              <HostButton
                label="Remove transport"
                size="sm"
                variant="ghost"
                onPress={() => setTransports((prev) => prev.filter((_, i) => i !== index))}
              />
            </HostRow>
          </HostCard>
        ))}
      </HostStack>
      <HostButton label="Add transport" size="sm" variant="ghost" icon="Plus" onPress={() => setTransports((prev) => [...prev, emptyDraft()])} />

      <HostSectionHeader title="Bearer token" />
      <HostFormRow label="Token (write-only)" description="Stored only in the plugin state dir and wired to http transports without an explicit ref. Leave blank to keep the stored one.">
        <HostTextInput value={token} onChangeText={setToken} placeholder="paste token" secureTextEntry autoCapitalize="none" />
      </HostFormRow>
      <HostFormRow label="Token ref" description="Key under which the token is stored. Defaults to token-<host id>.">
        <HostTextInput value={tokenRef} onChangeText={setTokenRef} placeholder="build-box-wake" autoCapitalize="none" />
      </HostFormRow>

      <HostRow gap={8}>
        <HostButton label={editing !== null ? "Save changes" : "Add host"} variant="primary" onPress={save} loading={add.isPending || update.isPending} />
        <HostButton label="Cancel" variant="ghost" onPress={onCancel} />
      </HostRow>
    </HostStack>
  );

  function setField(index: number, key: keyof TransportDraft, value: string) {
    setTransports((prev) => prev.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)));
  }
}
