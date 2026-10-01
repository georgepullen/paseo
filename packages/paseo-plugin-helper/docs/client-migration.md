# Migration Guide: `client/` → `ui/` + Host SDK Primitives

> **Status:** Phase 1 of paseo#847 — `client/` is deprecated and frozen.
> This guide is the canonical migration path for plugin authors.

The `client/` bespoke UI kit is deprecated. It stays importable and bug
fixes will land, but no new features will be added, and it is scheduled for
removal once the plugin migrations (phases 3–5 of #847) complete.

**Target architecture:** thin adapters from `paseo-plugin-helper/ui` composed
with the host SDK primitives the Paseo runtime already ships. The host owns
theme, layout, modal frames, scrolling, and icons — plugins delegate instead
of re-implementing.

---

## 1. The two replacement layers

### `paseo-plugin-helper/ui` (adapters)

Host-delegating adapters with no opinions of their own:

| Export | Purpose |
| --- | --- |
| `HostModalContent` | Fluid content wrapper for your own host `<Modal>` — renders the host `<Modal.Content>` with default `scrollable`, no helper scroller, no width caps |
| `HostModalSection` | Fluid plain `<View>` for `registerComposerPill` `renderModal` bodies — never nests a second `<Modal.Content>` |
| `HostScroll` | Explicit single scroll owner for surfaces where the host supplies no scroller (sidebar surfaces, settings screens); prefers the host `ScrollView`, falls back to plain React Native |
| `registerHelperSettingsScreen` | Contract-driven settings screen renderer — pass the host's `@getpaseo/plugin/client/ui` bundle as `options.ui` |
| `contractSchemaToFields` | Zod settings contract → host settings field descriptors |

### Host SDK primitives (`@getpaseo/plugin/client/*`)

Import these directly from the host bundle — they are the only UI primitives
a Paseo plugin client may import:

| Specifier | Exports |
| --- | --- |
| `@getpaseo/plugin/client/react-native` | `Icon`, `Modal` (+ `Modal.Content`), `useToast`, `ScrollView`, `FlatList`, `TextInput`, `copyText` |
| `@getpaseo/plugin/client/ui` | `SettingsGroup`, `SettingsSection`, `SettingsCard`, `SettingsRow`, `SettingsSwitch`, `SettingsSelect`, `SettingsInput`, `SettingsAction`, `ExternalLink` |
| `@getpaseo/plugin/client` | `useRpc`, `PluginSurfaceProps`, `PluginWorkspacePanelProps`, `PluginAgentPanelProps`, `PluginTheme` (type) |

---

## 2. Component mapping

| Deprecated `client/` import | Replacement |
| --- | --- |
| `ModalBody` | `HostModalContent` (own host modal) / `HostModalSection` (pill `renderModal`) / `HostScroll` (hostless scroller surfaces) |
| `ModalContent` | `HostModalContent` |
| `PluginThemeProvider` + `usePluginTheme()` | Host `theme` prop on your surface registration — read `theme.colors.*` directly; no provider, no CSS-variable scraping |
| `VisualFlair` / flair options | Delete — the host owns density, radius, and surface styling |
| `Button`, `InlineButton` | Host `Pressable` + `Text` composition, or a local component; keep 44pt touch targets |
| `Badge`, `StatusDot` | Local composition over host `theme.colors.status*` |
| `Card` + `Card.Header` | Host `SettingsCard` / `SettingsSection` for settings; local `View` composition elsewhere |
| `Tabs` | Local segmented control, or host `Modal.Content` sections |
| `TextInput`, `SearchInput` | Host `TextInput` (`@getpaseo/plugin/client/react-native`) |
| `Select` | Host `SettingsSelect` (settings) or local picker |
| `Toggle` | Host `SettingsSwitch` (settings) or local switch |
| `DataTable` | Host `FlatList` with your own row renderer |
| `KeyValue` / `KeyValueGroup` | Host `SettingsRow` / local `View` rows |
| `ProgressBar`, `MetricGauge` | Local composition (candidates for future `ui/` primitives) |
| `CodeBlock` | Local `<Text>` + host `copyText` |
| `CopyButton` | Host `copyText` + local button |
| `EmptyState`, `SectionHeader`, `Collapsible`, `CommandBox`, `AboutSection`, `HighlightedText`, `TruncatedText`, `InteractiveRow`, `AttentionBeacon`, `Responsive` / `useResponsive` | Local composition per plugin; no host equivalent — keep them plugin-local, not shared |
| `Row` / `Stack` / `Grid` / `ActionBar` / `FormRow` | Plain `react-native` `View` with flexbox |
| `copyToClipboard` | Host `copyText` (via `initClientHelpers({ copyText })` or direct import) |
| `triggerHaptic` | No host equivalent — keep plugin-local if still needed |
| `Icon` | Host `Icon` (`@getpaseo/plugin/client/react-native`) |
| `ForgeIcon`, `resolveForgeMark` | Keep from `client/` (pure resolver also in `paseo-plugin-helper/shared`) — no host equivalent yet |
| `useRpcQuery`, `useRpcMutation`, `useAutoRefreshQuery` | Keep from `client/` — headless hooks, not UI (extraction to `core` tracked separately) |
| `usePluginSettings`, `useSharedPluginSettings` | Keep from `client/` — headless hooks, not UI |
| `registerComposerPill`, `registerSidebarSurface`, `registerWorkspacePanel`, `registerAgentPanel`, `registerCommandCenterItem`, `registerCustomPills` | Keep from `client/` — lifecycle engines, not design system (extraction to `core` tracked separately) |
| `initClientHelpers` | **Still required** — the `ui/` adapters resolve host components through it |

---

## 3. Pattern-by-pattern examples

### 3.1 Modals: `ModalBody` → `HostModalContent` / `HostModalSection`

Before:

```tsx
import { Modal } from "@getpaseo/plugin/client/react-native";
import { ModalBody, ModalContent, Card, Button } from "paseo-plugin-helper/client";

<Modal title="Details" open={open} onOpenChange={setOpen}>
  <ModalContent header={<Tabs … />} headerMode="pinned">
    <Card>…</Card>
  </ModalContent>
</Modal>
```

After:

```tsx
import { Modal } from "@getpaseo/plugin/client/react-native";
import { HostModalContent } from "paseo-plugin-helper/ui";

<Modal title="Details" open={open} onOpenChange={setOpen}>
  <HostModalContent>
    {/* your content — host owns scroll, sizing, safe areas */}
  </HostModalContent>
</Modal>
```

Inside `registerComposerPill` `renderModal` (the host already provides the one
`<Modal.Content>`):

```tsx
import { HostModalSection } from "paseo-plugin-helper/ui";

renderModal: ({ agentId, close }) => (
  <HostModalSection>
    {/* fluid plain View — no nested Modal.Content, no scroller */}
  </HostModalSection>
)
```

For sidebar surfaces / settings screens where the host supplies **no**
scroller, use `HostScroll` as the single scroll owner.

### 3.2 Theming: `PluginThemeProvider` → host `theme` prop

Before:

```tsx
import { PluginThemeProvider, usePluginTheme } from "paseo-plugin-helper/client";

<PluginThemeProvider theme={theme} flair={{ density: "comfortable" }}>
  <MySurface />
</PluginThemeProvider>

function MySurface() {
  const { colors, isCompact } = usePluginTheme();
  return <Text style={{ color: colors.foreground }}>…</Text>;
}
```

After:

```tsx
// The host passes `theme` to your surface registration — no provider needed.
function MySurface({ theme }: { theme: PluginTheme }) {
  return <Text style={{ color: theme.colors.foreground }}>…</Text>;
}
```

Read `theme.colors.*` (`surface0/1/2`, `border`, `foreground`,
`foregroundMuted`, `accent`, `accentForeground`, `statusSuccess/Warning/Danger`)
directly. Delete flair/density/surfaceStyle options — the host owns those.

### 3.3 Settings screens

No change required — `registerHelperSettingsScreen` already delegates to the
host's settings primitives. Import it from `ui/` so your import graph skips
the deprecated bundle:

```tsx
import * as UpstreamUi from "@getpaseo/plugin/client/ui";
import { registerHelperSettingsScreen } from "paseo-plugin-helper/ui";

registerHelperSettingsScreen(client, mySettingsContract, {
  ui: UpstreamUi,
});
```

### 3.4 Clipboard

Before:

```tsx
import { copyToClipboard } from "paseo-plugin-helper/client";
await copyToClipboard("text", { toast, toastMessage: "SHA" });
```

After:

```tsx
import { copyText } from "@getpaseo/plugin/client/react-native";
await copyText("text");
toast.show("Copied SHA");
```

### 3.5 Host bootstrap

`initClientHelpers` stays — the `ui/` adapters resolve `Modal`, `ScrollView`,
`TextInput`, and `copyText` through it:

```tsx
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, useToast, ScrollView, TextInput, copyText } from "@getpaseo/plugin/client/react-native";
import { initClientHelpers } from "paseo-plugin-helper/client";

initClientHelpers({ Icon, Modal, useRpc, useToast, copyText, ScrollView, TextInput });
```

---

## 4. Migration checklist per plugin

1. Replace `ModalBody` / `ModalContent` with `HostModalContent` (own modals) or `HostModalSection` (pill `renderModal`); use `HostScroll` only where the host supplies no scroller.
2. Delete `PluginThemeProvider` and `usePluginTheme()`; read the host `theme` prop's `colors` directly.
3. Delete all `flair` options (`density`, `radius`, `surfaceStyle`, `accentColor`, `headingTransform`).
4. Swap `TextInput` / `SearchInput` → host `TextInput`; `Icon` → host `Icon`; `copyToClipboard` → host `copyText`.
5. Swap settings fields to the host `@getpaseo/plugin/client/ui` primitives via `registerHelperSettingsScreen` from `ui/`.
6. Replace `Row`/`Stack`/`Grid`/`ActionBar`/`FormRow` with plain `View` flexbox; keep `gap` values from the host layout, not a density scale.
7. Move plugin-specific visuals (badges, gauges, tabs, about sections) into the plugin's own client code — deliberately local, not shared.
8. Keep the headless hooks (`useRpcQuery`, `usePluginSettings`, …) and lifecycle registrars (`registerComposerPill`, `registerSidebarSurface`, …) importable from `client/` until their extraction to `core` lands.
9. Run the plugin's tests; then the repo suite (`npm test` at the root).

---

## 5. What stays in `client/`

The following are **not** UI-design-system pieces and remain in `client/`
until their tracked extraction (they are equally importable from `ui/` where
noted):

- Lifecycle engines: `registerComposerPill`, `registerSidebarSurface`,
  `registerWorkspacePanel`, `registerAgentPanel`,
  `registerCommandCenterItem`, `registerCustomPills`
- Headless hooks: `useRpcQuery`, `useRpcMutation`, `useAutoRefreshQuery`,
  `usePluginSettings`, `useSharedPluginSettings`
- Host seam: `initClientHelpers`, `host.ts`
- Settings renderer: `registerHelperSettingsScreen` (re-exported by `ui/`)
- Pure helpers: `sharedSnapshotKey`, `shouldEmitSnapshotUpdate`,
  `copyToClipboard`, `triggerHaptic`, `ForgeIcon` / `resolveForgeMark`
