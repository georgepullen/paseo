import { z } from "zod";
import { defineContract } from "./rpc.js";

// ---------------------------------------------------------------------------
// Label taxonomy & definitions (issues #122, #189, #200)
// ---------------------------------------------------------------------------

export const STATE_ORDER = [
  "state/0-triage",
  "state/1-wip",
  "state/2-review",
  "state/3-verify",
  "state/4-done",
] as const;
export type StateLabel = (typeof STATE_ORDER)[number];

export const PRIORITY_ORDER = [
  "priority/0-SOS",
  "priority/1-high",
  "priority/2-normal",
  "priority/3-low",
  "priority/4-backburner",
] as const;
export type PriorityLabel = (typeof PRIORITY_ORDER)[number];

export const ATTENTION_LABELS = [
  "attention/0-orchestrator",
  "attention/1-agent",
  "attention/2-user",
  "attention/3-ignore",
] as const;
export type AttentionLabel = (typeof ATTENTION_LABELS)[number];

export const SPEC_LABELS = [
  "spec/0-needed",
  "spec/1-checklist",
  "spec/2-approved",
] as const;
export type SpecLabel = (typeof SPEC_LABELS)[number];

const STATE_SHORT: Record<string, string> = {
  "state/0-triage": "Triage",
  "state/1-wip": "WIP",
  "state/2-review": "Review",
  "state/3-verify": "Verify",
  "state/4-done": "Done",
};

const PRIORITY_SHORT: Record<string, string> = {
  "priority/0-SOS": "SOS",
  "priority/1-high": "High",
  "priority/2-normal": "Normal",
  "priority/3-low": "Low",
  "priority/4-backburner": "Parked",
};

/** Compact display alias for a scoped label ("state/1-wip" -> "WIP"). */
export function shortLabelName(label: string): string {
  return STATE_SHORT[label] ?? PRIORITY_SHORT[label] ?? label;
}

/** The issue's current `state/*` label, or null when it carries none. */
export function currentStateLabel(labels: string[]): string | null {
  for (const label of labels) {
    if ((STATE_ORDER as readonly string[]).includes(label)) return label;
  }
  return null;
}

/** The issue's current `priority/*` label, defaulting to normal per spec §4.2. */
export function currentPriorityLabel(labels: string[]): string {
  for (const label of labels) {
    if ((PRIORITY_ORDER as readonly string[]).includes(label)) return label;
  }
  return "priority/2-normal";
}

/** Next `state/*` promotion step, or null when already done. */
export function nextStateLabel(labels: string[]): string | null {
  const current = currentStateLabel(labels);
  if (!current) return "state/1-wip";
  const idx = (STATE_ORDER as readonly string[]).indexOf(current);
  if (idx < 0 || idx + 1 >= STATE_ORDER.length) return null;
  return STATE_ORDER[idx + 1];
}

// ---------------------------------------------------------------------------
// Schemas & Types
// ---------------------------------------------------------------------------

export const ForgeLabelSchema = z.object({
  name: z.string(),
  color: z.string().optional(),
  description: z.string().optional(),
});
export type ForgeLabel = z.infer<typeof ForgeLabelSchema>;

export const ForgeIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  labels: z.array(z.string()),
  labelDetails: z.array(ForgeLabelSchema).default([]),
  comments: z.number().int().nonnegative().default(0),
  updatedAt: z.string(),
  createdAt: z.string().optional(),
  author: z.string().optional(),
  url: z.string().optional(),
  body: z.string().optional(),
  remoteUrl: z.string().optional(),
  repo: z.string().optional(),
  branch: z.string().optional(),
});
export type ForgeIssue = z.infer<typeof ForgeIssueSchema>;

export const AgentEnvelopeSchema = z.object({
  commentId: z.number(),
  sessionTitle: z.string(),
  agentShortId: z.string(),
  model: z.string().nullable().default(null),
  repo: z.string().nullable().default(null),
  branch: z.string().nullable().default(null),
  postedAt: z.string().nullable().default(null),
  commitShas: z.array(z.string().regex(/^[0-9a-f]{7,40}$/)).default([]),
  paseoLinks: z.array(z.string()).default([]),
  serverId: z.string().nullable().default(null),
});
export type AgentEnvelope = z.infer<typeof AgentEnvelopeSchema>;

export const IssueCommentSchema = z.object({
  id: z.number(),
  author: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  body: z.string(),
  url: z.string(),
  envelope: AgentEnvelopeSchema.nullable().default(null),
});
export type IssueComment = z.infer<typeof IssueCommentSchema>;

export const IssueDetailSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  labels: z.array(z.string()),
  labelDetails: z.array(ForgeLabelSchema).default([]),
  body: z.string(),
  author: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  webUrl: z.string(),
  comments: z.array(IssueCommentSchema),
  envelopes: z.array(AgentEnvelopeSchema),
});
export type IssueDetail = z.infer<typeof IssueDetailSchema>;

export interface ForgeRepoIdentity {
  host: string;
  owner: string;
  repo: string;
}

export type ForgeVisibility = "public" | "private" | "unknown";
export type ForgeAuthState =
  | "authenticated"
  | "lacks-write-scope"
  | "invalid-token"
  | "anonymous"
  | "unknown";

export interface ForgeAccessState {
  visibility: ForgeVisibility;
  auth: ForgeAuthState;
  canEdit: boolean;
  visibilityLabel: string | null;
  authLabel: string;
  authIcon: string;
  authVariant: "success" | "warning" | "danger" | "neutral";
  summary: string;
  requiredScopes: string;
}

export interface ForgeAccessInput {
  repoPublic?: boolean | null;
  tokenPresent?: boolean | null;
  tokenValid?: boolean | null;
  repoWritePermission?: boolean | null;
}

export function forgeWriteScopeList(): string {
  return "repo, write:issue (or issues:write)";
}

export function deriveForgeAccess(input: ForgeAccessInput = {}): ForgeAccessState {
  const visibility: ForgeVisibility =
    input.repoPublic === true
      ? "public"
      : input.repoPublic === false
        ? "private"
        : "unknown";

  let auth: ForgeAuthState;
  if (input.tokenValid === true) {
    auth = input.repoWritePermission === false ? "lacks-write-scope" : "authenticated";
  } else if (input.tokenPresent !== true) auth = "anonymous";
  else if (input.tokenValid === false) auth = "invalid-token";
  else auth = "unknown";

  const canEdit = auth === "authenticated";
  const visibilityLabel = visibility === "unknown" ? null : visibility;

  let authLabel: string;
  let authIcon: string;
  let authVariant: ForgeAccessState["authVariant"];
  if (auth === "authenticated") {
    authLabel = "Authenticated";
    authIcon = "KeyRound";
    authVariant = "success";
  } else if (auth === "lacks-write-scope") {
    authLabel = "Token lacks write scope";
    authIcon = "ShieldAlert";
    authVariant = "warning";
  } else if (auth === "invalid-token") {
    authLabel = "Token rejected";
    authIcon = "AlertTriangle";
    authVariant = "danger";
  } else if (auth === "anonymous") {
    authLabel = "No token";
    authIcon = "User";
    authVariant = "neutral";
  } else {
    authLabel = "Token unverified";
    authIcon = "AlertCircle";
    authVariant = "warning";
  }

  const scopeHint = `required scopes: ${forgeWriteScopeList()}.`;
  const authClause =
    auth === "authenticated"
      ? "Token accepted with write scope — reads and edits enabled."
      : auth === "lacks-write-scope"
        ? `Token accepted but it cannot push — edits disabled; ${scopeHint}`
        : auth === "invalid-token"
          ? "Saved token was rejected — edits disabled."
          : auth === "anonymous"
            ? "No token saved — edits disabled."
            : "Token state unverified — edits disabled.";

  const summary =
    visibility === "public"
      ? `Public repo — anonymous reads work. ${authClause}`
      : visibility === "private"
        ? `Private repo — a valid token is required for reads. ${authClause}`
        : `Repo visibility unknown (could not reach host). ${authClause}`;

  return {
    visibility,
    auth,
    canEdit,
    visibilityLabel,
    authLabel,
    authIcon,
    authVariant,
    summary,
    requiredScopes: forgeWriteScopeList(),
  };
}

export function writeGateNotice(access: ForgeAccessState, capability: string): string {
  if (access.auth === "lacks-write-scope") {
    return `Read-only — this token cannot ${capability}; it lacks write scope. Add a token with ${access.requiredScopes}.`;
  }
  return `Read-only — ${capability} needs a valid token. ${access.summary}`;
}

const ENVELOPE_FOOTER_PATTERN =
  /<sub>\s*🤖\s*\*\*(.+?)\*\*\s*\(`([^`)]+)`\)\s*·\s*`([^`]+)`\s*·\s*`([^`]+)`\s*·\s*_([^_]+)_\s*<\/sub>/;

export function stripAgentEnvelopeFooter(body: string | undefined | null): string {
  if (!body || typeof body !== "string") return "";
  return body.replace(ENVELOPE_FOOTER_PATTERN, "").replace(/---\s*$/, "").trim();
}

// ---------------------------------------------------------------------------
// Markdown-lite Parser
// ---------------------------------------------------------------------------

export type MarkdownLiteSpan =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; url: string };

export type MarkdownLiteBlock =
  | { kind: "paragraph"; spans: MarkdownLiteSpan[] }
  | { kind: "heading"; level: 1 | 2 | 3; spans: MarkdownLiteSpan[] }
  | { kind: "list"; ordered: boolean; items: MarkdownLiteSpan[][] }
  | { kind: "code"; text: string; language?: string };

const INLINE_PATTERN =
  /(`[^`]+`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(_([^_]+)_)/g;

export function parseMarkdownLiteInline(text: string): MarkdownLiteSpan[] {
  if (!text) return [];
  const spans: MarkdownLiteSpan[] = [];
  let cursor = 0;
  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      spans.push({ kind: "text", text: text.slice(cursor, match.index) });
    }
    if (match[1]) {
      spans.push({ kind: "code", text: match[1].slice(1, -1) });
    } else if (match[2]) {
      spans.push({ kind: "link", text: match[3], url: match[4] });
    } else if (match[5]) {
      spans.push({ kind: "bold", text: match[6] });
    } else if (match[7]) {
      spans.push({ kind: "bold", text: match[8] });
    } else if (match[9]) {
      spans.push({ kind: "italic", text: match[10] });
    } else if (match[11]) {
      spans.push({ kind: "italic", text: match[12] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    spans.push({ kind: "text", text: text.slice(cursor) });
  }
  return spans.filter((span) => {
    if (span.kind === "link") return span.text.length > 0 && span.url.length > 0;
    return span.text.length > 0;
  });
}

const HEADING_PATTERN = /^(#{1,3})\s+(.+?)\s*$/;
const UNORDERED_PATTERN = /^\s*[-*]\s+(.+)$/;
const ORDERED_PATTERN = /^\s*\d+[.)]\s+(.+)$/;
const FENCE_PATTERN = /^\s*```\s*([A-Za-z0-9_+-]*)\s*$/;

export function parseMarkdownLite(body: string | undefined | null): MarkdownLiteBlock[] {
  if (!body || typeof body !== "string") return [];
  const blocks: MarkdownLiteBlock[] = [];
  const paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join("\n").trim();
    paragraph.length = 0;
    if (!text) return;
    blocks.push({ kind: "paragraph", spans: parseMarkdownLiteInline(text) });
  };
  const closeList = (list: MarkdownLiteBlock | null) => {
    if (list && list.kind === "list" && list.items.length > 0) blocks.push(list);
  };
  let openList: MarkdownLiteBlock | null = null;
  let fenceLanguage: string | undefined;
  let fenceLines: string[] | null = null;
  for (const rawLine of body.split(/\r?\n/)) {
    const fence = FENCE_PATTERN.exec(rawLine);
    if (fence) {
      if (fenceLines == null) {
        flushParagraph();
        closeList(openList);
        openList = null;
        fenceLanguage = fence[1] || undefined;
        fenceLines = [];
      } else {
        blocks.push({
          kind: "code",
          text: fenceLines.join("\n").replace(/\n$/, ""),
          ...(fenceLanguage ? { language: fenceLanguage } : {}),
        });
        fenceLanguage = undefined;
        fenceLines = null;
      }
      continue;
    }
    if (fenceLines != null) {
      fenceLines.push(rawLine);
      continue;
    }
    if (!rawLine.trim()) {
      flushParagraph();
      closeList(openList);
      openList = null;
      continue;
    }
    const heading = HEADING_PATTERN.exec(rawLine);
    if (heading) {
      flushParagraph();
      closeList(openList);
      openList = null;
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        spans: parseMarkdownLiteInline(heading[2]),
      });
      continue;
    }
    const unordered = UNORDERED_PATTERN.exec(rawLine);
    const ordered = unordered ? null : ORDERED_PATTERN.exec(rawLine);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = !unordered;
      const content = (unordered?.[1] ?? ordered?.[1] ?? "").trim();
      if (!content) continue;
      if (!openList || openList.kind !== "list" || openList.ordered !== isOrdered) {
        closeList(openList);
        openList = { kind: "list", ordered: isOrdered, items: [] };
      }
      (openList as { kind: "list"; ordered: boolean; items: MarkdownLiteSpan[][] }).items.push(
        parseMarkdownLiteInline(content),
      );
      continue;
    }
    closeList(openList);
    openList = null;
    paragraph.push(rawLine);
  }
  if (fenceLines != null) {
    blocks.push({
      kind: "code",
      text: fenceLines.join("\n").replace(/\n$/, ""),
      ...(fenceLanguage ? { language: fenceLanguage } : {}),
    });
  }
  flushParagraph();
  closeList(openList);
  return blocks;
}

// ---------------------------------------------------------------------------
// RPC Contracts
// ---------------------------------------------------------------------------

export const IssueNumberInput = z
  .object({
    directory: z.string().optional(),
    remoteUrl: z.string().optional(),
    issueNumber: z.number().int().positive().optional(),
    number: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.issueNumber == null && value.number == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "issueNumber (or number) is required",
      });
    }
  });
export type IssueNumberInput = z.infer<typeof IssueNumberInput>;

export const IssueDetailInputSchema = IssueNumberInput;
export type IssueDetailInput = z.infer<typeof IssueDetailInputSchema>;

export const IssueDetailOutputSchema = z.object({
  repo: z.string().nullable(),
  issue: IssueDetailSchema.nullable(),
  fetchedAt: z.string().datetime(),
  repoPublic: z.boolean().nullable().default(null),
  tokenPresent: z.boolean().default(false),
  tokenValid: z.boolean().nullable().default(null),
  repoWritePermission: z.boolean().nullable().default(null),
  error: z.string().optional(),
});
export type IssueDetailOutput = z.infer<typeof IssueDetailOutputSchema>;

export const issueDetailContract = defineContract({
  name: "forge.issue-detail",
  description: "Full body, comments, and parsed Agent Envelopes for one issue",
  input: IssueDetailInputSchema,
  output: IssueDetailOutputSchema,
});

export const SetLabelInputSchema = IssueNumberInput.extend({
  label: z.string().min(1).max(100),
});
export type SetLabelInput = z.infer<typeof SetLabelInputSchema>;

export const SetLabelOutputSchema = z.object({
  number: z.number(),
  labels: z.array(z.string()),
  error: z.string().optional(),
});
export type SetLabelOutput = z.infer<typeof SetLabelOutputSchema>;

export const setLabelContract = defineContract({
  name: "forge.set-label",
  description: "Apply one scoped label; an exclusive scope evicts the rest",
  input: SetLabelInputSchema,
  output: SetLabelOutputSchema,
});

export const AddCommentInputSchema = IssueNumberInput.extend({
  body: z.string().min(1).max(10000),
});
export type AddCommentInput = z.infer<typeof AddCommentInputSchema>;

export const AddCommentOutputSchema = z.object({
  number: z.number(),
  commentId: z.number().nullable(),
  error: z.string().optional(),
});
export type AddCommentOutput = z.infer<typeof AddCommentOutputSchema>;

export const addCommentContract = defineContract({
  name: "forge.add-comment",
  description: "Post a quick comment (or steering note) to the issue thread",
  input: AddCommentInputSchema,
  output: AddCommentOutputSchema,
});

export const CREATE_ISSUE_TITLE_MAX = 200;
export const CREATE_ISSUE_BODY_MAX = 10000;
export const CREATE_ISSUE_LABEL_MAX = 50;

export const CreateIssueInputSchema = z.object({
  directory: z.string().optional(),
  remoteUrl: z.string().optional(),
  title: z.string(),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});
export type CreateIssueInput = z.infer<typeof CreateIssueInputSchema>;

export const CreateIssueOutputSchema = z.object({
  repo: z.string().nullable(),
  host: z.string().nullable().default(null),
  number: z.number().int().positive().nullable().default(null),
  error: z.string().optional(),
});
export type CreateIssueOutput = z.infer<typeof CreateIssueOutputSchema>;

export const createIssueContract = defineContract({
  name: "forge.create-issue",
  description: "Create a new issue on the configured forge repo",
  input: CreateIssueInputSchema,
  output: CreateIssueOutputSchema,
});

export function validateCreateIssueInput(input: {
  title?: unknown;
  body?: unknown;
  labels?: unknown;
}): string | null {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return "Issue title must not be empty";
  if (title.length > CREATE_ISSUE_TITLE_MAX) return "Issue title is too long";
  const body = typeof input.body === "string" ? input.body : "";
  if (body.length > CREATE_ISSUE_BODY_MAX) return "Issue description is too long";
  if (input.labels !== undefined) {
    if (!Array.isArray(input.labels)) return "Labels must be a list";
    if (input.labels.length > CREATE_ISSUE_LABEL_MAX) return "Too many labels";
    if (input.labels.some((label) => typeof label !== "string" || !label.trim())) {
      return "Label must not be empty";
    }
  }
  return null;
}

export function parseLabelList(text: string | undefined | null): string[] {
  if (!text || typeof text !== "string") return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const part of text.split(",")) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    names.push(trimmed);
  }
  return names;
}
