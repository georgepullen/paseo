import { defineRpc, defineSettingsContract } from "paseo-plugin-helper/shared";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Host model
// ---------------------------------------------------------------------------

/**
 * A wake transport. Ordered per host: the engine tries transports top to
 * bottom and falls through on the first failure. Three generic shapes:
 *
 *  - http: POST to a wake endpoint; `tokenRef` names a secret in the plugin
 *    state dir (never in this file's host records) and is sent as
 *    `Authorization: Bearer <token>` when configured.
 *  - wol: wake-on-LAN magic packet over UDP; `host` is optional and targets a
 *    specific relay/subnet-directed address instead of broadcast.
 *  - command: run a local command on the daemon host (e.g. a vendor wake CLI).
 *    Config is trusted: it runs arbitrary shell.
 */
export const HttpTransportSchema = z.object({
  type: z.literal("http"),
  url: z.string().min(1).max(2048),
  tokenRef: z.string().min(1).max(128).optional(),
});

export const WolTransportSchema = z.object({
  type: z.literal("wol"),
  mac: z
    .string()
    .regex(/^[0-9a-fA-F]{2}([:-][0-9a-fA-F]{2}){5}$/, "MAC must be six hex pairs separated by ':' or '-'"),
  host: z.string().min(1).max(253).optional(),
});

export const CommandTransportSchema = z.object({
  type: z.literal("command"),
  command: z.string().min(1).max(1024),
  args: z.array(z.string().max(1024)).max(64).optional(),
});

export const WakeTransportSchema = z.discriminatedUnion("type", [
  HttpTransportSchema,
  WolTransportSchema,
  CommandTransportSchema,
]);

/** Reachability probe: a custom command wins over ssh when both are set. */
export const StatusCommandSchema = z.object({
  command: z.string().min(1).max(1024),
  args: z.array(z.string().max(1024)).max(64).optional(),
});

export const HostRecordSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  sshTarget: z.string().min(1).max(253).optional(),
  statusCommand: StatusCommandSchema.optional(),
  /** Per-host override of the settings default wake window. */
  wakeWindowSeconds: z.number().int().min(10).max(3600).optional(),
  wakeTransports: z.array(WakeTransportSchema).max(8),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type HostRecord = z.infer<typeof HostRecordSchema>;
export type WakeTransport = z.infer<typeof WakeTransportSchema>;
export type HttpTransport = z.infer<typeof HttpTransportSchema>;
export type WolTransport = z.infer<typeof WolTransportSchema>;
export type CommandTransport = z.infer<typeof CommandTransportSchema>;
export type StatusCommand = z.infer<typeof StatusCommandSchema>;

/** Canonical failure modes, ported from the wake script this plugin generalizes. */
export const FAILURE_MODES = ["no-transport", "never-reachable", "saturated", "unknown-host"] as const;
export type FailureMode = (typeof FAILURE_MODES)[number];

export const JOB_STATUSES = ["starting", "waking", "verifying", "up", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const ACTIVE_JOB_STATUSES = ["starting", "waking", "verifying"] as const;

export const HOST_STATES = ["up", "down", "unknown"] as const;
export type HostState = (typeof HOST_STATES)[number];

const JobErrorSchema = z.object({
  mode: z.enum(FAILURE_MODES),
  message: z.string().max(512),
});

export const JobRecordSchema = z.object({
  jobId: z.string().min(1).max(64),
  hostId: z.string().min(1).max(64),
  status: z.enum(JOB_STATUSES),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().nullable(),
  error: JobErrorSchema.nullable(),
  log: z.array(z.string().max(512)).max(200),
});

export type JobRecord = z.infer<typeof JobRecordSchema>;

// ---------------------------------------------------------------------------
// RPC contracts
// ---------------------------------------------------------------------------

const HostListResultSchema = z.object({
  hosts: z.array(HostRecordSchema),
});

export const hostsListRpc = defineRpc({
  name: "hosts.list",
  input: z.object({}),
  output: HostListResultSchema,
});

export const hostsAddRpc = defineRpc({
  name: "hosts.add",
  input: z.object({
    name: z.string().min(1).max(64),
    sshTarget: z.string().min(1).max(253).optional(),
    statusCommand: StatusCommandSchema.optional(),
    wakeWindowSeconds: z.number().int().min(10).max(3600).optional(),
    wakeTransports: z.array(WakeTransportSchema).max(8),
    /** Write-only secret stored under `tokenRef` (or a generated ref) in the plugin state dir; never persisted with the host. */
    token: z.string().min(1).max(512).optional(),
    tokenRef: z.string().min(1).max(128).optional(),
  }),
  output: z.object({
    saved: z.boolean(),
    error: z.string().nullable(),
    host: HostRecordSchema.nullable(),
    hosts: z.array(HostRecordSchema),
  }),
});

export const hostsUpdateRpc = defineRpc({
  name: "hosts.update",
  input: z.object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(64).optional(),
    sshTarget: z.string().min(1).max(253).nullable().optional(),
    statusCommand: StatusCommandSchema.nullable().optional(),
    wakeWindowSeconds: z.number().int().min(10).max(3600).nullable().optional(),
    wakeTransports: z.array(WakeTransportSchema).max(8).optional(),
    token: z.string().min(1).max(512).optional(),
    tokenRef: z.string().min(1).max(128).optional(),
  }),
  output: z.object({
    saved: z.boolean(),
    error: z.string().nullable(),
    host: HostRecordSchema.nullable(),
    hosts: z.array(HostRecordSchema),
  }),
});

export const hostsRemoveRpc = defineRpc({
  name: "hosts.remove",
  input: z.object({
    id: z.string().min(1).max(64),
  }),
  output: z.object({
    saved: z.boolean(),
    error: z.string().nullable(),
    hosts: z.array(HostRecordSchema),
  }),
});

export const hostStatusRpc = defineRpc({
  name: "host.status",
  input: z.object({
    id: z.string().min(1).max(64),
  }),
  output: z.object({
    id: z.string(),
    state: z.enum(HOST_STATES),
    probedVia: z.enum(["statusCommand", "ssh", "none"]),
    error: z.string().nullable(),
    checkedAt: z.number().int().nonnegative(),
  }),
});

export const hostWakeRpc = defineRpc({
  name: "host.wake",
  input: z.object({
    id: z.string().min(1).max(64),
  }),
  output: z.object({
    accepted: z.boolean(),
    jobId: z.string().nullable(),
    status: z.enum(JOB_STATUSES),
    alreadyUp: z.boolean(),
    error: JobErrorSchema.nullable(),
  }),
});

export const jobStatusRpc = defineRpc({
  name: "job.status",
  input: z.object({
    jobId: z.string().min(1).max(64),
  }),
  output: z.object({
    job: JobRecordSchema.nullable(),
  }),
});

export const jobsListRpc = defineRpc({
  name: "jobs.list",
  input: z.object({}),
  output: z.object({
    jobs: z.array(JobRecordSchema),
  }),
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const powerSettingsContract = defineSettingsContract({
  name: "paseo-remote-power.settings",
  description: "remote power wake and probe defaults",
  schema: z.object({
    /** Bounded wake window: how long a wake job polls for reachability. */
    defaultWakeWindowSeconds: z
      .number()
      .min(10)
      .max(600)
      .default(110)
      .describe("How long a wake job waits for the host to become reachable (seconds)."),
    probeTimeoutSeconds: z
      .number()
      .min(1)
      .max(60)
      .default(8)
      .describe("Connect timeout for the ssh reachability probe (seconds)."),
    maxConcurrentWakes: z
      .number()
      .min(1)
      .max(8)
      .default(2)
      .describe("Maximum wake jobs running at the same time."),
    agentInjectionEnabled: z
      .boolean()
      .default(true)
      .describe("Inject the power_status/power_wake/power_job_status MCP tools into new agents. Takes effect on plugin reload."),
  }),
});
