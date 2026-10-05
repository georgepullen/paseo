/**
 * Visual flair vocabulary accepted by the lifecycle registration options.
 *
 * The legacy design system that consumed these presets is gone (#938); the
 * registrars still accept the shape so existing plugin call sites keep
 * type-checking, but the host theme drives every `ui/` adapter.
 */
export type RadiusStyle = "sharp" | "rounded" | "pill";
export type DensityStyle = "compact" | "comfortable" | "spacious";
export type SurfaceStyle = "flat" | "tinted" | "elevated";
export type HeadingTransform = "none" | "uppercase";

export interface VisualFlair {
  /** Corner radius preset for interactive elements and containers. */
  radius: RadiusStyle;
  /** Spacing and typography density. */
  density: DensityStyle;
  /** Surface background styling for cards, panels, and modal boxes. */
  surfaceStyle: SurfaceStyle;
  /** Optional custom brand accent color. */
  accentColor?: string;
  /** Default border width for cards and bordered elements (default: 1). */
  borderWidth: number;
  /** Text transform for section headers and meta labels. */
  headingTransform: HeadingTransform;
}
