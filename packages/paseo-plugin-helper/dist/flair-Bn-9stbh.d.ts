/**
 * @deprecated The `client/` bespoke UI kit is deprecated (paseo#847) and
 * frozen: no new features, bug fixes only. Migrate to the `ui/` adapter layer
 * (`paseo-plugin-helper/ui`) composed with host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */
type RadiusStyle = "sharp" | "rounded" | "pill";
type DensityStyle = "compact" | "comfortable" | "spacious";
type SurfaceStyle = "flat" | "tinted" | "elevated";
type HeadingTransform = "none" | "uppercase";
interface VisualFlair {
    /**
     * Corner radius preset for interactive elements and containers.
     * - "sharp": 2-3px (terminal / technical flair)
     * - "rounded": 6-8px (default Paseo native flair)
     * - "pill": 9999px (soft / playful flair)
     */
    radius: RadiusStyle;
    /**
     * Spacing and typography density.
     * - "compact": tight padding and smaller fonts (the default — plugin UI is
     *   dense by nature and generous padding wastes vertical space)
     * - "comfortable": balanced, roomier defaults (opt in per plugin)
     * - "spacious": generous breathing room
     */
    density: DensityStyle;
    /**
     * Surface background styling for cards, panels, and modal boxes.
     * - "flat": pure surface0 with border
     * - "tinted": subtle tinted foreground / accent wash
     * - "elevated": uses surface1 / surface2 hierarchy
     */
    surfaceStyle: SurfaceStyle;
    /**
     * Optional custom brand accent color (e.g. "#10b981", "#3b82f6").
     * Overrides Paseo's theme.colors.accent within this plugin.
     */
    accentColor?: string;
    /**
     * Default border width for cards and bordered elements (default: 1).
     */
    borderWidth: number;
    /**
     * Text transform for section headers and meta labels.
     */
    headingTransform: HeadingTransform;
}
declare const defaultFlair: VisualFlair;
declare function resolveRadius(radius: RadiusStyle, size?: "xs" | "sm" | "md" | "lg" | "pill"): number;

export { type DensityStyle as D, type HeadingTransform as H, type RadiusStyle as R, type SurfaceStyle as S, type VisualFlair as V, defaultFlair as d, resolveRadius as r };
