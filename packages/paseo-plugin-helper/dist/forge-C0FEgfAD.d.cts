import { S as SettingsContract } from './settings-BhKEPJRg.cjs';
import { z } from 'zod';

declare const SuiteSettingsSchema: z.ZodObject<{
    suiteTitle: z.ZodDefault<z.ZodString>;
    accentColor: z.ZodDefault<z.ZodString>;
    density: z.ZodDefault<z.ZodEnum<{
        compact: "compact";
        comfortable: "comfortable";
        spacious: "spacious";
    }>>;
    showSuiteTabs: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
type SuiteSettings = z.infer<typeof SuiteSettingsSchema>;
declare const SuiteSettingsContract: SettingsContract<{
    suiteTitle: string;
    accentColor: string;
    density: "compact" | "comfortable" | "spacious";
    showSuiteTabs: boolean;
}>;

/**
 * Shared forge brand-mark resolution.
 *
 * One host/kind -> mark table for every plugin that shows forge iconography,
 * so plugins never carry their own per-forge icon maps. The client-side
 * `<ForgeIcon>` renders this descriptor; server/shared code can consume the
 * pure resolver without pulling in React.
 *
 * GitHub and GitLab resolve to their Lucide marks; Codeberg, Forgejo and Gitea
 * have no Lucide equivalent and resolve to helper-drawn official mono marks.
 */
type ForgeKind = "github" | "gitlab" | "codeberg" | "forgejo" | "gitea" | "generic";
interface ResolvedForgeMark {
    /** Stable forge identity. */
    kind: ForgeKind;
    /** Human-readable forge name for labels and accessibility. */
    label: string;
    /** Host Lucide icon name; the exact mark on hosts with SVG support, the closest fallback otherwise. */
    lucideName: string;
    /** True when `<ForgeIcon>` draws the official mark instead of delegating to the host icon set. */
    custom: boolean;
}
interface ForgeMarkInput {
    /** Forge hostname, e.g. `codeberg.org` or `forge.example.com`. */
    host?: string | null;
    /** Explicit forge identity; wins over host detection when it names a known forge. */
    kind?: ForgeKind | string | null;
}
/**
 * Reduce a remote URL, `owner/repo` slug or bare hostname to a lowercase
 * hostname without scheme, userinfo, port, path or a leading `www.`.
 */
declare function normalizeForgeHost(host: string | null | undefined): string | null;
declare function isForgeKind(value: unknown): value is ForgeKind;
declare function forgeKindFromHost(host: string | null | undefined): ForgeKind;
/**
 * Resolve a forge descriptor from a hostname and/or explicit kind. Accepts a
 * bare host string for the common host-only case.
 */
declare function resolveForgeMark(input: ForgeMarkInput | string | null | undefined): ResolvedForgeMark;

export { type ForgeKind as F, type ResolvedForgeMark as R, type SuiteSettings as S, type ForgeMarkInput as a, SuiteSettingsContract as b, SuiteSettingsSchema as c, forgeKindFromHost as f, isForgeKind as i, normalizeForgeHost as n, resolveForgeMark as r };
