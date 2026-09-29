import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import {
  type UppidiToolDefinition,
  type UppidiFleetToolListOutput,
  type UppidiFleetToolExecuteInput,
  type UppidiFleetToolExecuteOutput,
} from "../shared/contracts.js";
import {
  runIssuesCheck,
  renderIssuesCheckJson,
  renderIssuesCheckMarkdown,
  ISSUES_CHECK_DEFAULT_HOSTNAME,
  ISSUES_CHECK_DEFAULT_REPO,
  ISSUES_CHECK_DEFAULT_STALE_WIP_HOURS,
  type IssuesCheckRole,
} from "./issues-check.js";
import {
  HookRouter,
  getActiveHookRouter,
  type WatchdogAuditOptions,
  type WatchdogAuditResult,
} from "./hook-router.js";

/**
 * Declared MCP tools for Uppidi Fleet.
 * Exposes deterministic board triage and fleet watchdog health auditing.
 */
export const FLEET_MCP_TOOLS: UppidiToolDefinition[] = [
  {
    name: "fleet_check_board",
    description:
      "Deterministic board check and triage ranking for Forgejo issues. Scans open issues, sweeps stale WIP, and returns ranked candidates.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: `Target repository in 'owner/repo' format (default: ${ISSUES_CHECK_DEFAULT_REPO})`,
          default: ISSUES_CHECK_DEFAULT_REPO,
        },
        hostname: {
          type: "string",
          description: `Forgejo host name (default: ${ISSUES_CHECK_DEFAULT_HOSTNAME})`,
          default: ISSUES_CHECK_DEFAULT_HOSTNAME,
        },
        role: {
          type: "string",
          enum: ["orchestrator", "worker", "coding_worker"],
          description: "Agent role perspective for triage ranking (default: orchestrator)",
          default: "orchestrator",
        },
        force: {
          type: "boolean",
          description: "Force board check even if cache signature matches",
          default: false,
        },
        all: {
          type: "boolean",
          description: "Process all open issues without filtering",
          default: false,
        },
        staleWipHours: {
          type: "number",
          description: `Hours before WIP issues are considered stale (default: ${ISSUES_CHECK_DEFAULT_STALE_WIP_HOURS})`,
          default: ISSUES_CHECK_DEFAULT_STALE_WIP_HOURS,
        },
        dryRun: {
          type: "boolean",
          description: "Dry-run mode: calculate triage without mutating board labels",
          default: false,
        },
        json: {
          type: "boolean",
          description: "Output machine-readable JSON instead of markdown",
          default: false,
        },
      },
    },
  },
  {
    name: "fleet_watchdog_audit",
    description:
      "Audit fleet agent health across daemons, detecting turn concurrency locks, timeouts, and stalled agents, with optional auto-recovery.",
    inputSchema: {
      type: "object",
      properties: {
        recover: {
          type: "boolean",
          description: "Attempt conservative recovery for eligible anomalies (default: false)",
          default: false,
        },
        frontDeskId: {
          type: "string",
          description: "Front Desk agent ID to notify regarding health alerts",
        },
        steerMessage: {
          type: "string",
          description: "Custom wake message when steering recovered agents",
        },
        cancellationRecencySeconds: {
          type: "number",
          description: "Upper bound in seconds to consider cancellation timeouts (default: 300)",
        },
        runningStaleSeconds: {
          type: "number",
          description: "Seconds of inactivity before flagging a running turn as zombie (default: 900)",
        },
        assumePendingWork: {
          type: "boolean",
          description: "Treat finished idle agents requiring attention as stalled (default: false)",
          default: false,
        },
        json: {
          type: "boolean",
          description: "Output machine-readable JSON instead of markdown",
          default: false,
        },
      },
    },
  },
];

export interface FleetToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Execute fleet_check_board with validated parameters.
 */
export async function executeFleetCheckBoard(args: Record<string, unknown> = {}): Promise<FleetToolCallResult> {
  const hostname = typeof args.hostname === "string" && args.hostname.trim() ? args.hostname.trim() : ISSUES_CHECK_DEFAULT_HOSTNAME;
  const repo = typeof args.repo === "string" && args.repo.trim() ? args.repo.trim() : ISSUES_CHECK_DEFAULT_REPO;
  const rawRole = typeof args.role === "string" ? args.role.trim() : "orchestrator";
  const validRoles = ["orchestrator", "worker", "coding_worker"] as const;
  if (!validRoles.includes(rawRole as (typeof validRoles)[number])) {
    return {
      content: [{ type: "text", text: `Invalid role "${rawRole}". Must be one of: ${validRoles.join(", ")}` }],
      isError: true,
    };
  }
  const role: IssuesCheckRole = rawRole === "worker" || rawRole === "coding_worker" ? "worker" : "orchestrator";
  const force = Boolean(args.force);
  const all = Boolean(args.all);
  const staleWipHours = typeof args.staleWipHours === "number" ? args.staleWipHours : ISSUES_CHECK_DEFAULT_STALE_WIP_HOURS;
  if (staleWipHours < 0) {
    return {
      content: [{ type: "text", text: "staleWipHours must be a non-negative number" }],
      isError: true,
    };
  }
  const dryRun = Boolean(args.dryRun);
  const json = Boolean(args.json);

  try {
    const outcome = await runIssuesCheck({
      hostname,
      repo,
      role,
      force,
      all,
      staleWipHours,
      dryRun,
    });

    const text = json
      ? renderIssuesCheckJson(outcome)
      : renderIssuesCheckMarkdown(outcome, { hostname, repo, role, staleWipHours, dryRun });

    return {
      content: [{ type: "text", text }],
      isError: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `fleet_check_board failed: ${message}` }],
      isError: true,
    };
  }
}

/**
 * Render a human-readable markdown report from watchdog audit results.
 */
export function renderWatchdogAuditMarkdown(audit: WatchdogAuditResult): string {
  const lines: string[] = ["# Fleet Watchdog Health Audit", ""];
  const date = new Date(audit.timestamp || Date.now()).toISOString();
  const audited = audit.audited || { orchestrators: 0, agents: 0, queues: 0 };
  lines.push(
    `Checked at: \`${date}\` \u00b7 Audited: **${audited.agents} agents**, **${audited.orchestrators} orchestrators**, **${audited.queues} queues**`,
  );

  if (!audit.anomalies || audit.anomalies.length === 0) {
    lines.push("", "\u2705 **All agents healthy.** No anomalies detected.");
    return lines.join("\n") + "\n";
  }

  lines.push("", `\u26a0\ufe0f **${audit.anomalies.length} anomal${audit.anomalies.length === 1 ? "y" : "ies"} detected:**`, "");

  for (const a of audit.anomalies) {
    const severityBadge = a.severity === "high" ? "\ud83d\udd34 HIGH" : "\ud83d\udfe1 MODERATE";
    const agentLabel = a.agentId ? `Agent \`${a.agentId}\`` : a.key ? `Queue \`${a.key}\`` : "Finding";
    lines.push(`### ${agentLabel} [${severityBadge}]`);
    if (a.taxonomy && a.taxonomy.length > 0) {
      lines.push(`- **Taxonomy:** ${a.taxonomy.map((t) => `\`${t}\``).join(", ")}`);
    }
    if (a.reason) {
      lines.push(`- **Reason:** ${a.reason}`);
    }
    if (a.details && typeof a.details === "object") {
      const detailEntries = Object.entries(a.details);
      for (const [tax, msg] of detailEntries) {
        lines.push(`- **${tax}:** ${msg}`);
      }
    }
    if (a.recovered !== undefined) {
      lines.push(`- **Recovered:** ${a.recovered ? "\u2705 Yes" : "\u274c No"}`);
    }
    if (a.recoveryActions && a.recoveryActions.length > 0) {
      lines.push(`- **Actions:** ${a.recoveryActions.join("; ")}`);
    }
    if (a.error) {
      lines.push(`- **Error:** ${a.error}`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

/**
 * Execute fleet_watchdog_audit with validated parameters.
 */
export async function executeFleetWatchdogAudit(args: Record<string, unknown> = {}): Promise<FleetToolCallResult> {
  const recover = Boolean(args.recover);
  const frontDeskId = typeof args.frontDeskId === "string" && args.frontDeskId.trim() ? args.frontDeskId.trim() : undefined;
  const steerMessage = typeof args.steerMessage === "string" && args.steerMessage.trim() ? args.steerMessage.trim() : undefined;
  const cancellationRecencySeconds =
    typeof args.cancellationRecencySeconds === "number" ? args.cancellationRecencySeconds : undefined;
  const runningStaleSeconds =
    typeof args.runningStaleSeconds === "number" ? args.runningStaleSeconds : undefined;
  const assumePendingWork = Boolean(args.assumePendingWork);
  const json = Boolean(args.json);

  const opts: WatchdogAuditOptions = {
    recover,
    frontDeskId,
    steerMessage,
    cancellationRecencySeconds,
    runningStaleSeconds,
    assumePendingWork,
  };

  try {
    const router = getActiveHookRouter() ?? new HookRouter();
    const result = await router.runWatchdogAudit(opts);
    const text = json ? JSON.stringify(result, null, 2) : renderWatchdogAuditMarkdown(result);

    return {
      content: [{ type: "text", text }],
      isError: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `fleet_watchdog_audit failed: ${message}` }],
      isError: true,
    };
  }
}

/**
 * Dispatch an MCP tool call by name.
 */
export async function executeFleetTool(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<FleetToolCallResult> {
  switch (toolName) {
    case "fleet_check_board":
      return executeFleetCheckBoard(args);
    case "fleet_watchdog_audit":
      return executeFleetWatchdogAudit(args);
    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: "${toolName}". Available fleet tools: ${FLEET_MCP_TOOLS.map((t) => t.name).join(", ")}`,
          },
        ],
        isError: true,
      };
  }
}

/**
 * RPC Handler: list available fleet tools.
 */
export async function handleFleetToolList(
  _input: Record<string, unknown>,
  _context?: PluginHandlerContext,
): Promise<UppidiFleetToolListOutput> {
  return {
    ok: true,
    tools: FLEET_MCP_TOOLS,
  };
}

/**
 * RPC Handler: execute a fleet tool.
 */
export async function handleFleetToolExecute(
  input: UppidiFleetToolExecuteInput,
  _context?: PluginHandlerContext,
): Promise<UppidiFleetToolExecuteOutput> {
  const result = await executeFleetTool(input.toolName, input.arguments);
  return {
    ok: !result.isError,
    output: result.content[0]?.text ?? "",
    isError: Boolean(result.isError),
    error: result.isError ? result.content[0]?.text : undefined,
  };
}
