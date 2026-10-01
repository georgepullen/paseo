/**
 * @deprecated The `client/` bespoke UI kit is deprecated (paseo#847) and
 * frozen: no new features, bug fixes only. Migrate to the `ui/` adapter layer
 * (`paseo-plugin-helper/ui`) composed with host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */
export type HapticFeedbackType =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "error";

const PATTERNS: Record<HapticFeedbackType, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 45,
  success: [15, 40, 20],
  warning: [30, 50, 30],
  error: [40, 60, 40, 60, 40],
};

/**
 * Cross-platform haptic feedback helper for Paseo plugins.
 * Supports web vibration API and graceful fallback when vibration is unavailable.
 */
export function triggerHaptic(type: HapticFeedbackType = "light"): boolean {
  try {
    const globalObj = typeof globalThis !== "undefined" ? (globalThis as any) : {};
    const nav = globalObj.navigator;
    if (typeof nav?.vibrate === "function") {
      const pattern = PATTERNS[type] ?? 15;
      return Boolean(nav.vibrate(pattern));
    }
  } catch {
    // Ignore environments where vibration permissions are denied or unavailable
  }
  return false;
}
