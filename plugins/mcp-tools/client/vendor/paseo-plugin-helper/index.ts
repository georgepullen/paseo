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
export * from "./theme/index";
export * from "./styles/index";
export * from "./components/index";
export * from "./layout/index";
export * from "./pill";
export * from "./surface";
export * from "./command-center";
export * from "./panel";
export * from "./query";
export * from "./query-refresh";
export * from "./snapshot";
export * from "./settings";
export * from "./shared-settings";
export * from "./settings-screen";
export * from "./utils/clipboard";
export * from "./utils/haptics";
export * from "./custom-pills";
export * from "./host";
export { Icon } from "./icon";
export { ForgeIcon, type ForgeIconProps } from "./forge-icon";
export {
  forgeMarkSource,
  forgeKindFromHost,
  isForgeKind,
  normalizeForgeHost,
  resolveForgeMark,
  type ForgeKind,
  type ForgeMarkInput,
  type ResolvedForgeMark,
} from "../../../shared/vendor/paseo-plugin-helper/forge";
export * from "./tickets";
