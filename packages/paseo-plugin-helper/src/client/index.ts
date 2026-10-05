/**
 * @deprecated The `client/` bespoke UI kit is deprecated (paseo#847).
 *
 * FROZEN — no new features, bug fixes only. Do not add components, props,
 * theme tokens, or helpers to this entry. The kit is superseded by the
 * `ui/` adapter layer (`paseo-plugin-helper/ui`) composed with host SDK
 * primitives (`@getpaseo/plugin/client/react-native`,
 * `@getpaseo/plugin/client/ui`). Existing consumers keep working, but all
 * new plugin UI must be built on `ui/` + host primitives.
 *
 * Migration guide: `docs/client-migration.md`.
 */
export * from "./theme/index.js";
export * from "./styles/index.js";
export * from "./components/index.js";
export * from "./layout/index.js";
export * from "./pill.js";
export * from "./surface.js";
export * from "./command-center.js";
export * from "./panel.js";
export * from "./query.js";
export * from "./query-refresh.js";
export * from "./snapshot.js";
export * from "./settings.js";
export * from "./shared-settings.js";
export * from "./settings-screen.js";
export * from "./utils/clipboard.js";
export * from "./utils/haptics.js";
export * from "./custom-pills.js";
export * from "./host.js";
export { Icon } from "./icon.js";
export { ForgeIcon, type ForgeIconProps } from "./forge-icon.js";
export {
  forgeMarkSource,
  forgeKindFromHost,
  isForgeKind,
  normalizeForgeHost,
  resolveForgeMark,
  type ForgeKind,
  type ForgeMarkInput,
  type ResolvedForgeMark,
} from "../shared/forge.js";
export * from "./tickets.js";
