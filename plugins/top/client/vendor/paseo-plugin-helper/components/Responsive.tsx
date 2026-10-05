/**
 * @deprecated The `client/` bespoke UI kit is deprecated (paseo#847) and
 * frozen: no new features, bug fixes only. Migrate to the `ui/` adapter layer
 * (`paseo-plugin-helper/ui`) composed with host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */
import React, { type ReactNode } from "react";
import { useResponsive, type UseResponsiveResult } from "../theme/useResponsive";

export interface ResponsiveProps {
  /**
   * Content to render on desktop / wide viewports.
   */
  desktop?: ReactNode;
  /**
   * Content to render on mobile platforms ('ios' | 'android').
   */
  mobile?: ReactNode;
  /**
   * Content to render when in compact mode (narrow trackbar, mobile bottom sheet, or split view).
   */
  compact?: ReactNode;
  /**
   * Content to render when in wide mode (not compact).
   */
  wide?: ReactNode;
  /**
   * Render function taking `UseResponsiveResult` or children.
   */
  children?: ReactNode | ((responsive: UseResponsiveResult) => ReactNode);
}

/**
 * Declarative component for rendering different UI elements across desktop, mobile, and compact layouts.
 *
 * @example
 * ```tsx
 * <Responsive
 *   desktop={<DataTable columns={["ID", "Name", "Status", "Latency"]} data={items} />}
 *   mobile={<DataTable columns={["Name", "Status"]} data={items} />}
 * />
 * ```
 */
/**
 * @deprecated Deprecated bespoke UI kit (paseo#847): frozen, bug fixes only.
 * Migrate to `paseo-plugin-helper/ui` + host SDK primitives
 * (`@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`).
 * See `docs/client-migration.md`.
 */
export function Responsive({ desktop, mobile, compact, wide, children }: ResponsiveProps) {
  const responsive = useResponsive();

  if (typeof children === "function") {
    return <>{children(responsive)}</>;
  }

  const selected = responsive.select<ReactNode>({
    desktop,
    mobile,
    compact,
    wide,
  });

  return <>{selected ?? children ?? null}</>;
}
