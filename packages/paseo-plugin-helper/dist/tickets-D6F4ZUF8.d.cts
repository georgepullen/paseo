import { P as PluginRpcContract } from './rpc-D27pph91.cjs';
import { z } from 'zod';

declare const STATE_ORDER: readonly ["state/0-triage", "state/1-wip", "state/2-review", "state/3-verify", "state/4-done"];
type StateLabel = (typeof STATE_ORDER)[number];
declare const PRIORITY_ORDER: readonly ["priority/0-SOS", "priority/1-high", "priority/2-normal", "priority/3-low", "priority/4-backburner"];
type PriorityLabel = (typeof PRIORITY_ORDER)[number];
declare const ATTENTION_LABELS: readonly ["attention/0-orchestrator", "attention/1-agent", "attention/2-user", "attention/3-ignore"];
type AttentionLabel = (typeof ATTENTION_LABELS)[number];
declare const SPEC_LABELS: readonly ["spec/0-needed", "spec/1-checklist", "spec/2-approved"];
type SpecLabel = (typeof SPEC_LABELS)[number];
/** Compact display alias for a scoped label ("state/1-wip" -> "WIP"). */
declare function shortLabelName(label: string): string;
/** The issue's current `state/*` label, or null when it carries none. */
declare function currentStateLabel(labels: string[]): string | null;
/** The issue's current `priority/*` label, defaulting to normal per spec §4.2. */
declare function currentPriorityLabel(labels: string[]): string;
/** Next `state/*` promotion step, or null when already done. */
declare function nextStateLabel(labels: string[]): string | null;
declare const ForgeLabelSchema: z.ZodObject<{
    name: z.ZodString;
    color: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type ForgeLabel = z.infer<typeof ForgeLabelSchema>;
declare const ForgeIssueSchema: z.ZodObject<{
    number: z.ZodNumber;
    title: z.ZodString;
    state: z.ZodString;
    labels: z.ZodArray<z.ZodString>;
    labelDetails: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        color: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    comments: z.ZodDefault<z.ZodNumber>;
    updatedAt: z.ZodString;
    createdAt: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    body: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    repo: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type ForgeIssue = z.infer<typeof ForgeIssueSchema>;
declare const AgentEnvelopeSchema: z.ZodObject<{
    commentId: z.ZodNumber;
    sessionTitle: z.ZodString;
    agentShortId: z.ZodString;
    model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    repo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    branch: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    postedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    commitShas: z.ZodDefault<z.ZodArray<z.ZodString>>;
    paseoLinks: z.ZodDefault<z.ZodArray<z.ZodString>>;
    serverId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type AgentEnvelope = z.infer<typeof AgentEnvelopeSchema>;
declare const IssueCommentSchema: z.ZodObject<{
    id: z.ZodNumber;
    author: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    body: z.ZodString;
    url: z.ZodString;
    envelope: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        commentId: z.ZodNumber;
        sessionTitle: z.ZodString;
        agentShortId: z.ZodString;
        model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        repo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        branch: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        postedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        commitShas: z.ZodDefault<z.ZodArray<z.ZodString>>;
        paseoLinks: z.ZodDefault<z.ZodArray<z.ZodString>>;
        serverId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
type IssueComment = z.infer<typeof IssueCommentSchema>;
declare const IssueDetailSchema: z.ZodObject<{
    number: z.ZodNumber;
    title: z.ZodString;
    state: z.ZodString;
    labels: z.ZodArray<z.ZodString>;
    labelDetails: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        color: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    body: z.ZodString;
    author: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    webUrl: z.ZodString;
    comments: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        author: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        body: z.ZodString;
        url: z.ZodString;
        envelope: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            commentId: z.ZodNumber;
            sessionTitle: z.ZodString;
            agentShortId: z.ZodString;
            model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            repo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            branch: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            postedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            commitShas: z.ZodDefault<z.ZodArray<z.ZodString>>;
            paseoLinks: z.ZodDefault<z.ZodArray<z.ZodString>>;
            serverId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    envelopes: z.ZodArray<z.ZodObject<{
        commentId: z.ZodNumber;
        sessionTitle: z.ZodString;
        agentShortId: z.ZodString;
        model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        repo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        branch: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        postedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        commitShas: z.ZodDefault<z.ZodArray<z.ZodString>>;
        paseoLinks: z.ZodDefault<z.ZodArray<z.ZodString>>;
        serverId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
type IssueDetail = z.infer<typeof IssueDetailSchema>;
interface ForgeRepoIdentity {
    host: string;
    owner: string;
    repo: string;
}
type ForgeVisibility = "public" | "private" | "unknown";
type ForgeAuthState = "authenticated" | "lacks-write-scope" | "invalid-token" | "anonymous" | "unknown";
interface ForgeAccessState {
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
interface ForgeAccessInput {
    repoPublic?: boolean | null;
    tokenPresent?: boolean | null;
    tokenValid?: boolean | null;
    repoWritePermission?: boolean | null;
}
declare function forgeWriteScopeList(): string;
declare function deriveForgeAccess(input?: ForgeAccessInput): ForgeAccessState;
declare function writeGateNotice(access: ForgeAccessState, capability: string): string;
declare function stripAgentEnvelopeFooter(body: string | undefined | null): string;
type MarkdownLiteSpan = {
    kind: "text";
    text: string;
} | {
    kind: "bold";
    text: string;
} | {
    kind: "italic";
    text: string;
} | {
    kind: "code";
    text: string;
} | {
    kind: "link";
    text: string;
    url: string;
};
type MarkdownLiteBlock = {
    kind: "paragraph";
    spans: MarkdownLiteSpan[];
} | {
    kind: "heading";
    level: 1 | 2 | 3;
    spans: MarkdownLiteSpan[];
} | {
    kind: "list";
    ordered: boolean;
    items: MarkdownLiteSpan[][];
} | {
    kind: "code";
    text: string;
    language?: string;
};
declare function parseMarkdownLiteInline(text: string): MarkdownLiteSpan[];
declare function parseMarkdownLite(body: string | undefined | null): MarkdownLiteBlock[];
declare const IssueNumberInput: z.ZodObject<{
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    issueNumber: z.ZodOptional<z.ZodNumber>;
    number: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type IssueNumberInput = z.infer<typeof IssueNumberInput>;
declare const IssueDetailInputSchema: z.ZodObject<{
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    issueNumber: z.ZodOptional<z.ZodNumber>;
    number: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type IssueDetailInput = z.infer<typeof IssueDetailInputSchema>;
declare const IssueDetailOutputSchema: z.ZodObject<{
    repo: z.ZodNullable<z.ZodString>;
    issue: z.ZodNullable<z.ZodObject<{
        number: z.ZodNumber;
        title: z.ZodString;
        state: z.ZodString;
        labels: z.ZodArray<z.ZodString>;
        labelDetails: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            color: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        body: z.ZodString;
        author: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        webUrl: z.ZodString;
        comments: z.ZodArray<z.ZodObject<{
            id: z.ZodNumber;
            author: z.ZodString;
            createdAt: z.ZodString;
            updatedAt: z.ZodString;
            body: z.ZodString;
            url: z.ZodString;
            envelope: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                commentId: z.ZodNumber;
                sessionTitle: z.ZodString;
                agentShortId: z.ZodString;
                model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                repo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                branch: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                postedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                commitShas: z.ZodDefault<z.ZodArray<z.ZodString>>;
                paseoLinks: z.ZodDefault<z.ZodArray<z.ZodString>>;
                serverId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>>>;
        }, z.core.$strip>>;
        envelopes: z.ZodArray<z.ZodObject<{
            commentId: z.ZodNumber;
            sessionTitle: z.ZodString;
            agentShortId: z.ZodString;
            model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            repo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            branch: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            postedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            commitShas: z.ZodDefault<z.ZodArray<z.ZodString>>;
            paseoLinks: z.ZodDefault<z.ZodArray<z.ZodString>>;
            serverId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    fetchedAt: z.ZodString;
    repoPublic: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    tokenPresent: z.ZodDefault<z.ZodBoolean>;
    tokenValid: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    repoWritePermission: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type IssueDetailOutput = z.infer<typeof IssueDetailOutputSchema>;
declare const issueDetailContract: PluginRpcContract<z.ZodObject<{
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    issueNumber: z.ZodOptional<z.ZodNumber>;
    number: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    repo: z.ZodNullable<z.ZodString>;
    issue: z.ZodNullable<z.ZodObject<{
        number: z.ZodNumber;
        title: z.ZodString;
        state: z.ZodString;
        labels: z.ZodArray<z.ZodString>;
        labelDetails: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            color: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        body: z.ZodString;
        author: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        webUrl: z.ZodString;
        comments: z.ZodArray<z.ZodObject<{
            id: z.ZodNumber;
            author: z.ZodString;
            createdAt: z.ZodString;
            updatedAt: z.ZodString;
            body: z.ZodString;
            url: z.ZodString;
            envelope: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                commentId: z.ZodNumber;
                sessionTitle: z.ZodString;
                agentShortId: z.ZodString;
                model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                repo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                branch: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                postedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                commitShas: z.ZodDefault<z.ZodArray<z.ZodString>>;
                paseoLinks: z.ZodDefault<z.ZodArray<z.ZodString>>;
                serverId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            }, z.core.$strip>>>;
        }, z.core.$strip>>;
        envelopes: z.ZodArray<z.ZodObject<{
            commentId: z.ZodNumber;
            sessionTitle: z.ZodString;
            agentShortId: z.ZodString;
            model: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            repo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            branch: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            postedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            commitShas: z.ZodDefault<z.ZodArray<z.ZodString>>;
            paseoLinks: z.ZodDefault<z.ZodArray<z.ZodString>>;
            serverId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    fetchedAt: z.ZodString;
    repoPublic: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    tokenPresent: z.ZodDefault<z.ZodBoolean>;
    tokenValid: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    repoWritePermission: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>> & {
    readonly description?: string;
};
declare const SetLabelInputSchema: z.ZodObject<{
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    issueNumber: z.ZodOptional<z.ZodNumber>;
    number: z.ZodOptional<z.ZodNumber>;
    label: z.ZodString;
}, z.core.$strip>;
type SetLabelInput = z.infer<typeof SetLabelInputSchema>;
declare const SetLabelOutputSchema: z.ZodObject<{
    number: z.ZodNumber;
    labels: z.ZodArray<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type SetLabelOutput = z.infer<typeof SetLabelOutputSchema>;
declare const setLabelContract: PluginRpcContract<z.ZodObject<{
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    issueNumber: z.ZodOptional<z.ZodNumber>;
    number: z.ZodOptional<z.ZodNumber>;
    label: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    number: z.ZodNumber;
    labels: z.ZodArray<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>> & {
    readonly description?: string;
};
declare const AddCommentInputSchema: z.ZodObject<{
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    issueNumber: z.ZodOptional<z.ZodNumber>;
    number: z.ZodOptional<z.ZodNumber>;
    body: z.ZodString;
}, z.core.$strip>;
type AddCommentInput = z.infer<typeof AddCommentInputSchema>;
declare const AddCommentOutputSchema: z.ZodObject<{
    number: z.ZodNumber;
    commentId: z.ZodNullable<z.ZodNumber>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type AddCommentOutput = z.infer<typeof AddCommentOutputSchema>;
declare const addCommentContract: PluginRpcContract<z.ZodObject<{
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    issueNumber: z.ZodOptional<z.ZodNumber>;
    number: z.ZodOptional<z.ZodNumber>;
    body: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    number: z.ZodNumber;
    commentId: z.ZodNullable<z.ZodNumber>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>> & {
    readonly description?: string;
};
declare const CREATE_ISSUE_TITLE_MAX = 200;
declare const CREATE_ISSUE_BODY_MAX = 10000;
declare const CREATE_ISSUE_LABEL_MAX = 50;
declare const CreateIssueInputSchema: z.ZodObject<{
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    body: z.ZodOptional<z.ZodString>;
    labels: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
type CreateIssueInput = z.infer<typeof CreateIssueInputSchema>;
declare const CreateIssueOutputSchema: z.ZodObject<{
    repo: z.ZodNullable<z.ZodString>;
    host: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    number: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type CreateIssueOutput = z.infer<typeof CreateIssueOutputSchema>;
declare const createIssueContract: PluginRpcContract<z.ZodObject<{
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    body: z.ZodOptional<z.ZodString>;
    labels: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>, z.ZodObject<{
    repo: z.ZodNullable<z.ZodString>;
    host: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    number: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>> & {
    readonly description?: string;
};
declare function validateCreateIssueInput(input: {
    title?: unknown;
    body?: unknown;
    labels?: unknown;
}): string | null;
declare function parseLabelList(text: string | undefined | null): string[];

export { parseLabelList as $, ATTENTION_LABELS as A, IssueDetailOutputSchema as B, CREATE_ISSUE_BODY_MAX as C, IssueDetailSchema as D, IssueNumberInput as E, type ForgeAccessInput as F, type MarkdownLiteSpan as G, type PriorityLabel as H, type IssueComment as I, STATE_ORDER as J, type SetLabelInput as K, SetLabelInputSchema as L, type MarkdownLiteBlock as M, type SetLabelOutput as N, SetLabelOutputSchema as O, PRIORITY_ORDER as P, type SpecLabel as Q, type StateLabel as R, SPEC_LABELS as S, addCommentContract as T, createIssueContract as U, currentPriorityLabel as V, currentStateLabel as W, deriveForgeAccess as X, forgeWriteScopeList as Y, issueDetailContract as Z, nextStateLabel as _, type AddCommentInput as a, parseMarkdownLite as a0, parseMarkdownLiteInline as a1, setLabelContract as a2, shortLabelName as a3, stripAgentEnvelopeFooter as a4, validateCreateIssueInput as a5, writeGateNotice as a6, AddCommentInputSchema as b, type AddCommentOutput as c, AddCommentOutputSchema as d, type AgentEnvelope as e, AgentEnvelopeSchema as f, type AttentionLabel as g, CREATE_ISSUE_LABEL_MAX as h, CREATE_ISSUE_TITLE_MAX as i, type CreateIssueInput as j, CreateIssueInputSchema as k, type CreateIssueOutput as l, CreateIssueOutputSchema as m, type ForgeAccessState as n, type ForgeAuthState as o, type ForgeIssue as p, ForgeIssueSchema as q, type ForgeLabel as r, ForgeLabelSchema as s, type ForgeRepoIdentity as t, type ForgeVisibility as u, IssueCommentSchema as v, type IssueDetail as w, type IssueDetailInput as x, IssueDetailInputSchema as y, type IssueDetailOutput as z };
