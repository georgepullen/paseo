export { P as PlatformType, a as PluginTheme, R as ResponsiveLayout, S as StatusVariant, T as ThemeColors } from '../types-BKH2AGK1.js';
import { P as PluginRpcContract } from '../rpc-D27pph91.js';
export { D as DefineRpcOptions, R as RpcInput, a as RpcOutput, d as defineContract, b as defineRpc } from '../rpc-D27pph91.js';
export { F as FormatBytesOptions, a as FormatCompactNumberOptions, M as MetricThresholds, T as TruncateOptions, b as TruncatePathOptions, f as formatBytes, c as formatCompactNumber, d as formatDuration, e as formatNumber, g as formatUptime, r as resolveMetricStatus, s as stripAnsi, t as truncate, h as truncateMiddle, i as truncatePath } from '../formatters-BgjVLUgj.js';
export { D as DefineSettingsContractOptions, S as SettingsContract, a as SettingsEmptyInput, b as SettingsEmptyInputSchema, d as defineSettingsContract } from '../settings-CP1gv9q3.js';
export { F as ForgeKind, a as ForgeMarkInput, R as ResolvedForgeMark, S as SuiteSettings, b as SuiteSettingsContract, c as SuiteSettingsSchema, f as forgeKindFromHost, d as forgeMarkSource, i as isForgeKind, n as normalizeForgeHost, r as resolveForgeMark } from '../forge-Cs7Wnmen.js';
export { A as ATTENTION_LABELS, a as AddCommentInput, b as AddCommentInputSchema, c as AddCommentOutput, d as AddCommentOutputSchema, e as AgentEnvelope, f as AgentEnvelopeSchema, g as AttentionLabel, B as BARE_REPO_PATTERN, C as CREATE_ISSUE_BODY_MAX, h as CREATE_ISSUE_LABEL_MAX, i as CREATE_ISSUE_TITLE_MAX, j as CreateIssueInput, k as CreateIssueInputSchema, l as CreateIssueOutput, m as CreateIssueOutputSchema, n as CustomPillDefinition, o as CustomPillDefinitionSchema, p as CustomPillModal, q as CustomPillModalSchema, r as CustomPillState, s as CustomPillThresholds, t as CustomPillThresholdsSchema, F as ForgeAccessInput, u as ForgeAccessState, v as ForgeAuthState, w as ForgeContextInput, x as ForgeContextInputSchema, y as ForgeContextOutput, z as ForgeContextOutputSchema, D as ForgeIssue, E as ForgeIssueSchema, G as ForgeLabel, H as ForgeLabelRef, I as ForgeLabelSchema, J as ForgeRemote, K as ForgeRepoIdentity, L as ForgeTargetResolution, M as ForgeVisibility, N as INSTALL_LABEL_MODES, O as InstallLabelMode, P as InstallLabelsInput, Q as InstallLabelsInputSchema, R as InstallLabelsOutput, S as InstallLabelsOutputSchema, T as IssueComment, U as IssueCommentSchema, V as IssueDetail, W as IssueDetailInput, X as IssueDetailInputSchema, Y as IssueDetailOutput, Z as IssueDetailOutputSchema, _ as IssueDetailSchema, $ as IssueNumberInput, a0 as LabelDefinition, a1 as LabelSetPlan, a2 as MarkdownLiteBlock, a3 as MarkdownLiteSpan, a4 as OpenIssuesInput, a5 as OpenIssuesInputSchema, a6 as OpenIssuesOutput, a7 as OpenIssuesOutputSchema, a8 as PASEO_LABEL_SCOPES, a9 as PASEO_LINK_PATTERN, aa as PASEO_SERVER_PATTERN, ab as PRIORITY_ORDER, ac as PriorityLabel, ad as SHA_PATTERN, ae as SPEC_LABELS, af as STATE_ORDER, ag as SearchIssuesInput, ah as SearchIssuesInputSchema, ai as SearchIssuesOutput, aj as SearchIssuesOutputSchema, ak as SetLabelInput, al as SetLabelInputSchema, am as SetLabelOutput, an as SetLabelOutputSchema, ao as SpecLabel, ap as StateLabel, aq as activeForgeForDirectory, ar as addCommentContract, as as createIssueContract, at as currentPriorityLabel, au as currentStateLabel, av as deriveForgeAccess, aw as forgeCapabilityFromRepo, ax as forgeContextContract, ay as forgeForgeContextContract, az as forgeWriteScopeList, aA as formatPillDisplay, aB as isValidForgeTarget, aC as issueDetailContract, aD as liveScopesFromIssues, aE as liveScopesFromLabels, aF as nextStateLabel, aG as normalizeIssueNumber, aH as openIssuesContract, aI as parseAgentEnvelope, aJ as parseForgeRemote, aK as parseLabelList, aL as parseMarkdownLite, aM as parseMarkdownLiteInline, aN as parseNumericPillValue, aO as paseoLabelScopes, aP as paseoLabelSet, aQ as planLabelSetInstall, aR as rankIssues, aS as resolveCustomPillStatus, aT as resolveForgeTarget, aU as scopeOfLabel, aV as searchIssuesContract, aW as setLabelContract, aX as shortLabelName, aY as stripAgentEnvelopeFooter, aZ as validateCreateIssueInput, a_ as writeGateNotice } from '../tickets-cIDmm9to.js';
import 'zod';

/**
 * Cleanup handle returned by a feature contribution.
 *
 * A disposer MUST be idempotent: calling it more than once must not throw and
 * must not tear down anything twice. `composeFeatureModules` additionally
 * wraps every disposer it receives so the *composed* teardown is idempotent
 * even if an individual module forgets.
 */
type FeatureDisposer = () => void;
/**
 * A self-contained, droppable unit of plugin functionality.
 *
 * A feature module owns one concern (custom pills, timeline telemetry,
 * permission auditing, …) and exposes it through up to two contribution hooks:
 * `contributeServer` for the daemon-side `PluginServerContext` and
 * `contributeClient` for the client-side `PluginClientContext`. Both hooks are
 * optional; a module may contribute to one side, both, or neither.
 *
 * Lifecycle contract
 * ------------------
 * - A contribution hook runs at most once per `contribute*` call on the
 *   composing plugin entry.
 * - It may return a {@link FeatureDisposer} for cleanup, or `void` when it owns
 *   nothing to release.
 * - Returned disposers MUST be idempotent (see {@link FeatureDisposer}).
 * - The plugin entry composes modules with {@link composeFeatureModules} and
 *   returns the combined disposer to Paseo.
 * - `contracts` is declarative metadata (name-keyed RPC contracts the module
 *   owns); it is not registered automatically. The composing entry still calls
 *   `server.handle(contract, handler)`.
 *
 * Context types are generic because `paseo-plugin-helper/shared` must not
 * import the Paseo SDK. Type a module with the SDK contexts at the call site:
 *
 * ```ts
 * import type { PluginClientContext } from "@getpaseo/plugin/client";
 * import type { PluginServerContext } from "@getpaseo/plugin/server";
 * import type { FeatureModule } from "paseo-plugin-helper/shared";
 *
 * export const customPills: FeatureModule<PluginServerContext, PluginClientContext> = {
 *   id: "custom-pills",
 *   contracts: { list: listCustomPillsRpc },
 *   contributeServer(server) {
 *     const { unsubscribe } = registerCustomPillsServer(server);
 *     return unsubscribe;
 *   },
 *   contributeClient(client) {
 *     const remove = registerCustomPills(client);
 *     return remove;
 *   },
 * };
 * ```
 */
interface FeatureModule<TServerContext = unknown, TClientContext = unknown> {
    /** Stable, plugin-unique module id (e.g. `"custom-pills"`). */
    readonly id: string;
    /** Daemon-side contribution. Returns an idempotent disposer, or `void`. */
    readonly contributeServer?: (server: TServerContext) => FeatureDisposer | void;
    /** Client-side contribution. Returns an idempotent disposer, or `void`. */
    readonly contributeClient?: (client: TClientContext) => FeatureDisposer | void;
    /** RPC contracts this module owns, keyed by a local name. */
    readonly contracts?: Record<string, PluginRpcContract>;
}
/**
 * A composed set of feature modules. `contributeServer` / `contributeClient`
 * run every module's hook for that side and return a single combined,
 * idempotent disposer that tears the modules down in reverse order.
 */
interface FeatureComposition<TServerContext = unknown, TClientContext = unknown> {
    /** Module ids in composition order. */
    readonly ids: readonly string[];
    /** Every declared contract, flattened in module order and de-duplicated. */
    readonly contracts: readonly PluginRpcContract[];
    /** Run all `contributeServer` hooks; returns the combined disposer. */
    contributeServer(server: TServerContext): FeatureDisposer;
    /** Run all `contributeClient` hooks; returns the combined disposer. */
    contributeClient(client: TClientContext): FeatureDisposer;
}
/**
 * Compose {@link FeatureModule}s into one contribution unit for a plugin entry.
 *
 * Modules run in array order on contribution and are disposed in reverse (LIFO)
 * order. The returned combined disposer is idempotent: calling it twice runs
 * teardown once and never throws the first error a second time.
 *
 * ```ts
 * import type { PluginClientContext } from "@getpaseo/plugin/client";
 * import type { PluginServerContext } from "@getpaseo/plugin/server";
 * import { composeFeatureModules } from "paseo-plugin-helper/shared";
 * import { customPills } from "./features/custom-pills.js";
 * import { timelineTelemetry } from "./features/timeline-telemetry.js";
 *
 * const features = composeFeatureModules<PluginServerContext, PluginClientContext>([
 *   customPills,
 *   timelineTelemetry,
 * ]);
 *
 * export function contributeServer(server: PluginServerContext) {
 *   return features.contributeServer(server);
 * }
 *
 * export function contributeClient(client: PluginClientContext) {
 *   return features.contributeClient(client);
 * }
 * ```
 *
 * @throws if two modules share an `id` or declare the same RPC contract `name`.
 */
declare function composeFeatureModules<TServerContext = unknown, TClientContext = unknown>(modules: readonly FeatureModule<TServerContext, TClientContext>[]): FeatureComposition<TServerContext, TClientContext>;

declare class TimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(message: string, timeoutMs: number);
}
/**
 * Races a promise against a timeout duration in milliseconds.
 * If the timeout expires before the promise resolves, rejects with a TimeoutError.
 * Automatically cleans up the timer on resolution or rejection.
 */
declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label?: string): Promise<T>;

/**
 * Text-run splitting for search highlighting, shared by every helper surface
 * that paints matched query text and by the forges search surfaces that scroll
 * to a match. A query is matched literally via `indexOf` on lowercased strings —
 * never compiled as a regular expression — so user input cannot inject a
 * pattern.
 *
 * Remote forge search is fuzzy: a returned issue may match a query it does not
 * contain verbatim. When the literal query is absent the splitter highlights
 * the query's multi-character tokens at word starts, so a fuzzy result still
 * reads. Callers on a single primary label may additionally opt into marking
 * the whole field when not even a token hits (`fallbackToWholeField`); callers
 * that paint many small runs leave it off. `hasFuzzyHighlight` is the
 * whole-surface test for go-to-match.
 *
 * `normalizeSearchQuery` strips surrounding quotes and whitespace for the local
 * filter/highlight paths; remote search keeps the raw query.
 */
interface HighlightPart {
    /** The run's source text, in its original casing. */
    text: string;
    /** True when this run is an occurrence of the (normalized) query. */
    matched: boolean;
}
/**
 * Normalize a search query for local matching and highlighting: trim, then peel
 * any surrounding pair of matching single/double quotes (`"meta"`, `'meta'`,
 * `""meta""`). Remote forge search keeps the raw query — Forgejo treats quotes
 * as a phrase operator — so only the local paths normalize, letting quoted and
 * unquoted input filter and paint identically. A lone quote is left intact.
 */
declare function normalizeSearchQuery(query: string): string;
interface HighlightOptions {
    /**
     * When true and neither a literal nor a token hit exists, the whole text is
     * returned as a single matched run so a fuzzy search result is still visibly
     * marked. Off by default: callers that paint many small runs (label chips,
     * markdown spans) must not light every one of them up.
     */
    fallbackToWholeField?: boolean;
}
/**
 * Split `text` into alternating unmatched/matched runs for every
 * case-insensitive occurrence of `query`. Surrounding whitespace and matching
 * surrounding quotes on the query are ignored; an empty or whitespace-only
 * query (or empty text) yields the whole text as a single unmatched run.
 *
 * When the literal query is absent the splitter highlights the query's
 * multi-character tokens at word starts. If no token hits either, the text is
 * left unmatched unless the caller opted into `fallbackToWholeField`, which
 * marks the whole field so a fuzzy result is never silently unmarked.
 */
declare function splitHighlightParts(text: string, query: string, options?: HighlightOptions): HighlightPart[];
/**
 * Whether `text` contains the literal trimmed query (case-insensitively) —
 * the precise, pre-fuzzy test callers use to tell a true hit from the token
 * fallback.
 */
declare function hasHighlightMatch(text: string, query: string): boolean;
/**
 * Whether `text` highlights at all for the trimmed `query`: a literal hit or,
 * failing that, a word-start hit for any of the query's multi-character tokens.
 * Unlike `splitHighlightParts` this never reports the whole-field fallback, so
 * it pinpoints the result/section that genuinely mentions a fuzzy query rather
 * than every field.
 */
declare function hasFuzzyHighlight(text: string, query: string): boolean;

interface SuppressedSink {
    debug?(message: string, data?: unknown): void;
    warn?(message: string, data?: unknown): void;
}
/**
 * Surfaces a caught/suppressed error to the plugin log at debug level
 * (warn when `level: "warn"`). Fire-and-forget `catch(() => undefined)`
 * sites should route through here so `paseo plugin logs` shows them
 * when dev debug logging is enabled.
 */
declare function reportSuppressed(sink: Pick<SuppressedSink, "debug" | "warn"> | undefined, context: string, error: unknown, level?: "debug" | "warn"): void;

export { type FeatureComposition, type FeatureDisposer, type FeatureModule, type HighlightOptions, type HighlightPart, PluginRpcContract, type SuppressedSink, TimeoutError, composeFeatureModules, hasFuzzyHighlight, hasHighlightMatch, normalizeSearchQuery, reportSuppressed, splitHighlightParts, withTimeout };
