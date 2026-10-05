import { createContext } from "react";

/**
 * Scroll-ownership signal for `ModalBody`.
 *
 * - `"helper"` — the default; `ModalBody` decides from the surface
 *   (compact/mobile) and `scrollMode`.
 * - `"host"` — an ancestor host view already provides the one scroller
 *   (0.8 composer popovers). `ModalBody` renders plain content.
 * - `"required"` — the ancestor has NO host scroller and the content is
 *   host-sized, so `ModalBody` MUST own the scroll on every surface. Set by
 *   `registerSidebarSurface` (a plugin surface is a full host page whose body
 *   is not wrapped in a host scroller) and by `ModalContent`.
 * - `"popover"` — the host anchored-popover already supplies the sole scroller.
 *
 * The context lives in `lifecycle/` so the registration engines can mark the
 * subtrees they render without importing the frozen `client/` layout kit.
 * `client/layout/ModalBody` re-exports it for compatibility.
 */
export type ModalBodyScrollOwner = "helper" | "host" | "required" | "popover";

export const ModalBodyScrollOwnerContext = createContext<ModalBodyScrollOwner>("helper");
