export { C as ClipboardEnvironment, a as ClipboardTier, b as CopyToClipboardOptions, D as DEFAULT_SIDEBAR_MAX_CONTENT_WIDTH, H as HapticFeedbackType, M as ModalBodyScrollOwner, c as ModalBodyScrollOwnerContext, P as PillIconResolver, d as PillLabelResolver, e as PillLiveContext, f as PillLivePayload, R as RegisterAgentPanelOptions, g as RegisterComposerPillOptions, h as RegisterSidebarSurfaceOptions, i as RegisterWorkspacePanelOptions, j as RenderModalProps, S as SidebarSurfaceRegistrar, W as WorkspacePanelRegistrar, k as clipboardTierOrder, l as copyToClipboard, r as registerAgentPanel, m as registerComposerPill, n as registerSidebarSurface, o as registerWorkspacePanel, p as resolvePillModalScrollable, t as triggerHaptic } from '../haptics-C4_nWhk_.cjs';
export { H as HostLayoutProvider, a as HostLayoutProviderProps, b as HostTheme, c as HostThemeProvider, d as HostThemeProviderProps, e as alpha, g as getContrastColor, f as getLuminance, h as getStatusColor, i as getVariantPalette, u as useHostLayout, j as useHostTheme } from '../host-color-BZsn0eHw.cjs';
import React__default, { ComponentType, ReactNode } from 'react';
import { a as PluginTheme } from '../types-BKH2AGK1.cjs';
import { d as HostLayout } from '../host-whQ9H8yb.cjs';
import { V as VisualFlair } from '../flair-Bn-9stbh.cjs';
import 'react-native';
import '@getpaseo/plugin/client';

/**
 * Presentational seam for the lifecycle registration engines.
 *
 * The `client/` entry re-exports the registrars and installs a provider that
 * mounts the frozen `PluginThemeProvider` on top of the host theme, preserving
 * the legacy design-system behavior existing consumers depend on. Consumers
 * importing `paseo-plugin-helper/lifecycle` directly get only
 * `HostThemeProvider` (the host `theme` prop drives every ui/ adapter), which
 * is the migration target — no frozen `client/` theme or layout code is pulled.
 */
interface RegistrarThemeProps {
    theme: PluginTheme;
    layout?: HostLayout;
    flair?: Partial<VisualFlair>;
    children: ReactNode;
}
type RegistrarLegacyThemeProvider = ComponentType<RegistrarThemeProps>;
/**
 * Installed once by the `client/` compatibility shim. Keeping it out of the
 * `lifecycle/` entry's runtime imports is what lets that entry stay free of the
 * frozen design system.
 */
declare function setRegistrarLegacyThemeProvider(provider: RegistrarLegacyThemeProvider | undefined): void;
/** Mounts the host theme (always) and the legacy provider (when installed). */
declare function RegistrarThemeScope({ theme, layout, flair, children }: RegistrarThemeProps): React__default.JSX.Element;

export { type RegistrarLegacyThemeProvider, type RegistrarThemeProps, RegistrarThemeScope, setRegistrarLegacyThemeProvider };
