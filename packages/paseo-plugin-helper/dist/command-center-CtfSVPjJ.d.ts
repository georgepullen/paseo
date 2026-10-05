import { P as PluginCleanup } from './host-CcdHvtoG.js';

/**
 * @deprecated The `client/` bespoke UI kit is deprecated (paseo#847) and
 * frozen: no new features, bug fixes only. Migrate to the `ui/` adapter layer
 * (`paseo-plugin-helper/ui`) composed with host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */

/**
 * Structural registrar interface satisfied by both Paseo v0.7 PluginContext
 * and Paseo v0.8 PluginClientContext.
 */
interface CommandCenterItemRegistrar {
    addCommandCenterItem(contribution: any): any;
}
type CommandCenterContext = "global" | "workspace" | "agent";
/**
 * Capabilities the host passes to a command-center item's `onSelect`. Mirrors
 * the subset of `PluginCommandCapabilities` the helper needs; the real host
 * context carries additional fields (paseo, rpc, workspace, agent) that a
 * handler may read off its own typed contribution.
 */
interface CommandCenterCapabilities {
    openSurface(id: string): void;
    openSettings(id: string): void;
}
interface CommandCenterItemContribution {
    id: string;
    title: string;
    icon: string;
    keywords?: readonly string[];
    context: CommandCenterContext;
    onSelect(context: CommandCenterCapabilities): void | Promise<void>;
}
/**
 * Registers a command-center palette item — the entry the host Ctrl+K command
 * center lists. Thin pass-through that keeps plugins on the helper seam and
 * works with both Paseo v0.7 PluginContext and Paseo v0.8 PluginClientContext.
 */
declare function registerCommandCenterItem(plugin: CommandCenterItemRegistrar, contribution: CommandCenterItemContribution): PluginCleanup;

export { type CommandCenterCapabilities as C, type CommandCenterContext as a, type CommandCenterItemContribution as b, type CommandCenterItemRegistrar as c, registerCommandCenterItem as r };
