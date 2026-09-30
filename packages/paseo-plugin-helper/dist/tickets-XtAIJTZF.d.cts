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
    updatedAt: z.ZodOptional<z.ZodString>;
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
declare const OpenIssuesInputSchema: z.ZodObject<{
    workspaceId: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
type OpenIssuesInput = z.infer<typeof OpenIssuesInputSchema>;
declare const OpenIssuesOutputSchema: z.ZodObject<{
    repo: z.ZodNullable<z.ZodString>;
    host: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    issues: z.ZodArray<z.ZodObject<{
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
        updatedAt: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        author: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        body: z.ZodOptional<z.ZodString>;
        remoteUrl: z.ZodOptional<z.ZodString>;
        repo: z.ZodOptional<z.ZodString>;
        branch: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    openIssueCount: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    page: z.ZodDefault<z.ZodNumber>;
    hasMore: z.ZodDefault<z.ZodBoolean>;
    derivedRemote: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    remoteSource: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
        explicit: "explicit";
        derived: "derived";
    }>>>;
    repoPublic: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    tokenPresent: z.ZodDefault<z.ZodBoolean>;
    tokenValid: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    repoWritePermission: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type OpenIssuesOutput = z.infer<typeof OpenIssuesOutputSchema>;
declare const openIssuesContract: PluginRpcContract<z.ZodObject<{
    workspaceId: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    repo: z.ZodNullable<z.ZodString>;
    host: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    issues: z.ZodArray<z.ZodObject<{
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
        updatedAt: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        author: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        body: z.ZodOptional<z.ZodString>;
        remoteUrl: z.ZodOptional<z.ZodString>;
        repo: z.ZodOptional<z.ZodString>;
        branch: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    openIssueCount: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    page: z.ZodDefault<z.ZodNumber>;
    hasMore: z.ZodDefault<z.ZodBoolean>;
    derivedRemote: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    remoteSource: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
        explicit: "explicit";
        derived: "derived";
    }>>>;
    repoPublic: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    tokenPresent: z.ZodDefault<z.ZodBoolean>;
    tokenValid: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    repoWritePermission: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>> & {
    readonly description?: string;
};
declare const SearchIssuesInputSchema: z.ZodObject<{
    workspaceId: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    query: z.ZodString;
    page: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
type SearchIssuesInput = z.infer<typeof SearchIssuesInputSchema>;
declare const SearchIssuesOutputSchema: z.ZodObject<{
    repo: z.ZodNullable<z.ZodString>;
    host: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    issues: z.ZodArray<z.ZodObject<{
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
        updatedAt: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        author: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        body: z.ZodOptional<z.ZodString>;
        remoteUrl: z.ZodOptional<z.ZodString>;
        repo: z.ZodOptional<z.ZodString>;
        branch: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    page: z.ZodDefault<z.ZodNumber>;
    hasMore: z.ZodDefault<z.ZodBoolean>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type SearchIssuesOutput = z.infer<typeof SearchIssuesOutputSchema>;
declare const searchIssuesContract: PluginRpcContract<z.ZodObject<{
    workspaceId: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    query: z.ZodString;
    page: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    repo: z.ZodNullable<z.ZodString>;
    host: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    issues: z.ZodArray<z.ZodObject<{
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
        updatedAt: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        author: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        body: z.ZodOptional<z.ZodString>;
        remoteUrl: z.ZodOptional<z.ZodString>;
        repo: z.ZodOptional<z.ZodString>;
        branch: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    page: z.ZodDefault<z.ZodNumber>;
    hasMore: z.ZodDefault<z.ZodBoolean>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>> & {
    readonly description?: string;
};
declare const ForgeContextInputSchema: z.ZodObject<{
    workspaceId: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type ForgeContextInput = z.infer<typeof ForgeContextInputSchema>;
declare const ForgeContextOutputSchema: z.ZodObject<{
    directory: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    derivedRemote: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    derivedHost: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    derivedRepo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type ForgeContextOutput = z.infer<typeof ForgeContextOutputSchema>;
declare const forgeContextContract: PluginRpcContract<z.ZodObject<{
    workspaceId: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    directory: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    derivedRemote: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    derivedHost: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    derivedRepo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>> & {
    readonly description?: string;
};
declare const forgeForgeContextContract: PluginRpcContract<z.ZodObject<{
    workspaceId: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    directory: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    derivedRemote: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    derivedHost: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    derivedRepo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>> & {
    readonly description?: string;
};
declare const SHA_PATTERN: RegExp;
declare const PASEO_LINK_PATTERN: RegExp;
declare const PASEO_SERVER_PATTERN: RegExp;
declare function parseAgentEnvelope(commentId: number, body: string | undefined | null): AgentEnvelope | null;
interface ForgeRemote {
    host: string;
    owner: string;
    repo: string;
}
declare function parseForgeRemote(url: string | undefined | null): ForgeRemote | null;
declare const BARE_REPO_PATTERN: RegExp;
type ForgeTargetResolution = {
    ok: true;
    host: string;
    repo: string;
    source: "explicit" | "derived";
} | {
    ok: false;
    error: string;
};
declare function resolveForgeTarget(explicitTarget: string | undefined | null, gitRemoteUrl: string | undefined | null): ForgeTargetResolution;
declare function isValidForgeTarget(target: string | undefined | null): boolean;
declare function forgeCapabilityFromRepo(payload: unknown): boolean | null;
declare function activeForgeForDirectory(settings: {
    activeForgeByDirectory?: Record<string, string>;
    remotesByDirectory?: Record<string, string>;
    forgesByDirectory?: Record<string, string[]>;
} | undefined | null, directory: string | undefined | null): string | null;
declare function normalizeIssueNumber(input: {
    issueNumber?: number;
    number?: number;
}): number | null;
declare function scopeOfLabel(label: string): string | null;
declare function liveScopesFromLabels(allLabels: string[]): string[];
declare function liveScopesFromIssues(issues: Pick<ForgeIssue, "labels">[]): string[];
declare function rankIssues<T extends Pick<ForgeIssue, "labels" | "updatedAt">>(issues: T[]): T[];
declare const PASEO_LABEL_SCOPES: readonly ["state", "priority", "attention", "spec", "kind", "target", "format", "size", "dep", "flag"];
declare const INSTALL_LABEL_MODES: readonly ["merge", "replace"];
type InstallLabelMode = (typeof INSTALL_LABEL_MODES)[number];
interface ForgeLabelRef {
    id?: number;
    name: string;
}
interface LabelDefinition {
    name: string;
    color: string;
    exclusive: boolean;
    description: string;
}
interface LabelSetPlan {
    mode: InstallLabelMode;
    create: LabelDefinition[];
    remove: ForgeLabelRef[];
    skip: string[];
}
declare const InstallLabelsInputSchema: z.ZodObject<{
    directory: z.ZodOptional<z.ZodString>;
    remoteUrl: z.ZodOptional<z.ZodString>;
    mode: z.ZodEnum<{
        replace: "replace";
        merge: "merge";
    }>;
}, z.core.$strip>;
type InstallLabelsInput = z.infer<typeof InstallLabelsInputSchema>;
declare const InstallLabelsOutputSchema: z.ZodObject<{
    host: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    repo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    mode: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
        replace: "replace";
        merge: "merge";
    }>>>;
    created: z.ZodDefault<z.ZodArray<z.ZodString>>;
    skipped: z.ZodDefault<z.ZodArray<z.ZodString>>;
    removed: z.ZodDefault<z.ZodArray<z.ZodString>>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type InstallLabelsOutput = z.infer<typeof InstallLabelsOutputSchema>;
declare function paseoLabelSet(): LabelDefinition[];
declare function paseoLabelScopes(): string[];
declare function planLabelSetInstall(existing: ForgeLabelRef[], mode: InstallLabelMode): LabelSetPlan;

export { type OpenIssuesOutput as $, ATTENTION_LABELS as A, BARE_REPO_PATTERN as B, CREATE_ISSUE_BODY_MAX as C, type ForgeTargetResolution as D, type ForgeVisibility as E, type ForgeAccessInput as F, type InstallLabelMode as G, type InstallLabelsInput as H, INSTALL_LABEL_MODES as I, InstallLabelsInputSchema as J, type InstallLabelsOutput as K, InstallLabelsOutputSchema as L, type IssueComment as M, IssueCommentSchema as N, type IssueDetail as O, type IssueDetailInput as P, IssueDetailInputSchema as Q, type IssueDetailOutput as R, IssueDetailOutputSchema as S, IssueDetailSchema as T, IssueNumberInput as U, type LabelDefinition as V, type LabelSetPlan as W, type MarkdownLiteBlock as X, type MarkdownLiteSpan as Y, type OpenIssuesInput as Z, OpenIssuesInputSchema as _, type AddCommentInput as a, OpenIssuesOutputSchema as a0, PASEO_LABEL_SCOPES as a1, PASEO_LINK_PATTERN as a2, PASEO_SERVER_PATTERN as a3, PRIORITY_ORDER as a4, type PriorityLabel as a5, SHA_PATTERN as a6, SPEC_LABELS as a7, STATE_ORDER as a8, type SearchIssuesInput as a9, parseAgentEnvelope as aA, parseForgeRemote as aB, parseLabelList as aC, parseMarkdownLite as aD, parseMarkdownLiteInline as aE, paseoLabelScopes as aF, paseoLabelSet as aG, planLabelSetInstall as aH, rankIssues as aI, resolveForgeTarget as aJ, scopeOfLabel as aK, searchIssuesContract as aL, setLabelContract as aM, shortLabelName as aN, stripAgentEnvelopeFooter as aO, validateCreateIssueInput as aP, writeGateNotice as aQ, SearchIssuesInputSchema as aa, type SearchIssuesOutput as ab, SearchIssuesOutputSchema as ac, type SetLabelInput as ad, SetLabelInputSchema as ae, type SetLabelOutput as af, SetLabelOutputSchema as ag, type SpecLabel as ah, type StateLabel as ai, activeForgeForDirectory as aj, addCommentContract as ak, createIssueContract as al, currentPriorityLabel as am, currentStateLabel as an, deriveForgeAccess as ao, forgeCapabilityFromRepo as ap, forgeContextContract as aq, forgeForgeContextContract as ar, forgeWriteScopeList as as, isValidForgeTarget as at, issueDetailContract as au, liveScopesFromIssues as av, liveScopesFromLabels as aw, nextStateLabel as ax, normalizeIssueNumber as ay, openIssuesContract as az, AddCommentInputSchema as b, type AddCommentOutput as c, AddCommentOutputSchema as d, type AgentEnvelope as e, AgentEnvelopeSchema as f, type AttentionLabel as g, CREATE_ISSUE_LABEL_MAX as h, CREATE_ISSUE_TITLE_MAX as i, type CreateIssueInput as j, CreateIssueInputSchema as k, type CreateIssueOutput as l, CreateIssueOutputSchema as m, type ForgeAccessState as n, type ForgeAuthState as o, type ForgeContextInput as p, ForgeContextInputSchema as q, type ForgeContextOutput as r, ForgeContextOutputSchema as s, type ForgeIssue as t, ForgeIssueSchema as u, type ForgeLabel as v, type ForgeLabelRef as w, ForgeLabelSchema as x, type ForgeRemote as y, type ForgeRepoIdentity as z };
