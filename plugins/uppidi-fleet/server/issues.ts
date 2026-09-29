import { spawn } from "node:child_process";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import {
  type UppidiIssuesInput,
  type UppidiIssuesOutput,
  type UppidiIssue,
  type AttentionLabel,
  type UppidiTransitionIssueInput,
  type UppidiTransitionIssueOutput,
  type KanbanColumnId,
} from "../shared/contracts.js";
import { forgejoApiGet, forgejoToken, resolveForgejoHost } from "./forgejo-api.js";

const DEFAULT_REPO = "xpufx-org/paseo";

export async function handleUppidiIssues(
  input: UppidiIssuesInput,
  _context?: PluginHandlerContext,
): Promise<UppidiIssuesOutput> {
  const repo = input.repo || DEFAULT_REPO;
  const host = resolveForgejoHost();
  const token = await forgejoToken(host);

  const path = `/api/v1/repos/${repo}/issues?state=${input.state}&limit=50`;
  const res = await forgejoApiGet<
    Array<{
      number: number;
      title: string;
      state: string;
      body?: string;
      comments?: number;
      html_url?: string;
      updated_at?: string;
      labels?: Array<{ name: string }>;
    }>
  >(path, { host, token });

  if (res.outcome !== "ok") {
    return {
      ok: false,
      repo,
      issues: [],
      openCount: 0,
      inFlightCount: 0,
      reviewCount: 0,
      needsYouCount: 0,
      error: res.error,
    };
  }

  const rawList = Array.isArray(res.data) ? res.data : [];
  const issues: UppidiIssue[] = rawList.map((raw) => {
    const labelNames = (raw.labels ?? []).map((l) => l.name);
    const normalizedLabels = labelNames.map((l) => l.trim().toLowerCase());

    // Operator attention is strictly signaled by user attention labels. The
    // canonical, scoped form is `attention/2-user`; legacy `attention/user`
    // and `attention:user` spellings normalize to the same operator signal.
    const hasUserAttention = normalizedLabels.some(
      (l) => l === "attention/2-user" || l === "attention/user" || l === "attention:user",
    );
    const hasOrchestratorAttention = normalizedLabels.some(
      (l) => l === "attention/0-orchestrator" || l === "attention/orchestrator" || l === "attention:orchestrator",
    );

    let attention: AttentionLabel = "attention/1-agent";
    if (hasUserAttention) attention = "attention/2-user";
    else if (hasOrchestratorAttention) attention = "attention/0-orchestrator";

    let status: "Backlog" | "In progress" | "Review" | "Done" = "Backlog";
    if (raw.state === "closed" || labelNames.some((l) => l === "state/4-done")) {
      status = "Done";
    } else if (labelNames.some((l) => l === "state/2-review" || l === "state/3-verify" || l.startsWith("review/"))) {
      status = "Review";
    } else if (labelNames.some((l) => l === "state/1-wip")) {
      status = "In progress";
    }

    // Detect branch from issue body if referenced
    const branchMatch = (raw.body || "").match(/\b(feat|fix|chore|docs)\/[a-zA-Z0-9_\-\.\/]+\b/);

    return {
      number: raw.number,
      title: raw.title,
      state: raw.state,
      repo: repo.split("/")[1] || repo,
      status,
      attention,
      branch: branchMatch ? branchMatch[0] : undefined,
      comments: raw.comments ?? 0,
      labels: labelNames,
      url: raw.html_url,
      updatedAt: raw.updated_at,
    };
  });

  const openIssues = issues.filter((i) => i.state === "open");
  return {
    ok: true,
    repo,
    issues,
    openCount: openIssues.length,
    inFlightCount: openIssues.filter((i) => i.status === "In progress").length,
    reviewCount: openIssues.filter((i) => i.status === "Review").length,
    needsYouCount: openIssues.filter((i) => i.attention === "attention/2-user").length,
  };
}

export const STATE_LABELS_FOR_COLUMN: Record<KanbanColumnId, string> = {
  backlog: "state/0-triage",
  in_progress: "state/1-wip",
  review: "state/2-review",
  done: "state/4-done",
};

export const ALL_STATE_LABELS = [
  "state/0-triage",
  "state/1-wip",
  "state/2-review",
  "state/3-verify",
  "state/4-done",
];

export type CommandRunnerFn = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

function defaultTeaxRun(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("teax", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
    child.on("error", (err) => {
      resolve({ code: -1, stdout, stderr: err.message });
    });
  });
}

let commandRunner: CommandRunnerFn = defaultTeaxRun;

export function setIssueCommandRunnerForTest(fn: CommandRunnerFn | null): void {
  commandRunner = fn ?? defaultTeaxRun;
}

export async function handleUppidiTransitionIssue(
  input: UppidiTransitionIssueInput,
  _context?: PluginHandlerContext,
): Promise<UppidiTransitionIssueOutput> {
  const repo = input.repo || DEFAULT_REPO;
  const host = resolveForgejoHost();
  const targetLabel = input.targetLabel || STATE_LABELS_FOR_COLUMN[input.targetState];
  const removeLabels = ALL_STATE_LABELS.filter((l) => l !== targetLabel);

  try {
    if (input.targetState !== "done") {
      // Reopen issue if it was closed
      await commandRunner(["issue", "reopen", String(input.number), "--hostname", host, "-R", repo]);
    }

    const editArgs = [
      "issue",
      "edit",
      String(input.number),
      "--hostname",
      host,
      "-R",
      repo,
      "--add-label",
      targetLabel,
    ];
    for (const rem of removeLabels) {
      editArgs.push("--remove-label", rem);
    }

    const editRes = await commandRunner(editArgs);
    if (editRes.code !== 0 && !editRes.stdout.includes("OK") && !editRes.stdout.includes("updated") && editRes.stderr) {
      return {
        ok: false,
        number: input.number,
        targetState: input.targetState,
        error: editRes.stderr || `Command failed with code ${editRes.code}`,
      };
    }

    if (input.targetState === "done") {
      await commandRunner(["issue", "close", String(input.number), "--hostname", host, "-R", repo]);
    }

    return {
      ok: true,
      number: input.number,
      targetState: input.targetState,
      appliedLabel: targetLabel,
      message: `Issue #${input.number} moved to ${input.targetState} (${targetLabel})`,
    };
  } catch (err: any) {
    return {
      ok: false,
      number: input.number,
      targetState: input.targetState,
      error: err?.message || String(err),
    };
  }
}
