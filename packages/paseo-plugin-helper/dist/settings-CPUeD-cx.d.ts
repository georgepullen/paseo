import { ZodType, z } from 'zod';
import { P as PluginRpcContract } from './rpc-D27pph91.js';

/**
 * Structural theme types for Paseo plugins.
 *
 * These interfaces mirror the Paseo host theme shapes without importing any
 * Paseo SDK module, so `paseo-plugin-helper/shared` (and everything
 * built on it) typechecks and bundles identically against Paseo v0.7 and
 * Paseo v0.8 SDKs.
 */
interface ThemeColors {
    readonly surface0: string;
    readonly surface1: string;
    readonly surface2: string;
    readonly border: string;
    readonly foreground: string;
    readonly foregroundMuted: string;
    readonly accent: string;
    readonly accentForeground: string;
    readonly statusSuccess: string;
    readonly statusWarning: string;
    readonly statusDanger: string;
}
interface PluginTheme {
    readonly colors: ThemeColors;
}
type PlatformType = "ios" | "android" | "web";
interface ResponsiveLayout {
    compact: boolean;
    platform: PlatformType;
    width?: number;
    height?: number;
}
type StatusVariant = "neutral" | "success" | "warning" | "danger" | "accent" | "info";

declare const SettingsEmptyInputSchema: z.ZodOptional<z.ZodUnion<readonly [z.ZodVoid, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
type SettingsEmptyInput = z.infer<typeof SettingsEmptyInputSchema>;
interface SettingsContract<TSettings extends Record<string, any>> {
    readonly name: string;
    readonly schema: ZodType<TSettings>;
    readonly defaultSettings: TSettings;
    readonly get: PluginRpcContract<ZodType<SettingsEmptyInput>, ZodType<TSettings>>;
    readonly update: PluginRpcContract<ZodType<Partial<TSettings>>, ZodType<TSettings>>;
    readonly reset: PluginRpcContract<ZodType<SettingsEmptyInput>, ZodType<TSettings>>;
    readonly description?: string;
}
interface DefineSettingsContractOptions<TSettings extends Record<string, any>> {
    /**
     * Unique name for the settings domain (e.g. "top.settings" or "myplugin.config").
     * Automatically normalizes invalid RPC characters.
     */
    name: string;
    /**
     * Zod Object schema representing the full settings shape.
     * Use `.default(...)` on fields to provide default values.
     */
    schema: ZodType<TSettings> & {
        partial?: () => ZodType<Partial<TSettings>>;
    };
    /**
     * Optional default data override if schema fields do not all specify `.default()`.
     */
    defaultData?: Partial<TSettings>;
    /**
     * Optional human-readable description of the settings.
     */
    description?: string;
}
/**
 * Defines a pair of typed Paseo RPC contracts (get, update, reset) for plugin settings.
 */
declare function defineSettingsContract<TSettings extends Record<string, any>>(options: DefineSettingsContractOptions<TSettings>): SettingsContract<TSettings>;

export { type DefineSettingsContractOptions as D, type PlatformType as P, type ResponsiveLayout as R, type SettingsContract as S, type ThemeColors as T, type PluginTheme as a, type SettingsEmptyInput as b, SettingsEmptyInputSchema as c, type StatusVariant as d, defineSettingsContract as e };
