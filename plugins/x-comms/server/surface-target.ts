import { UnresolvableTargetError } from "./busy.ts";
import { findDaemonByRef, type RegistryDaemon } from "./registry.ts";
import { unknownDaemonMessage } from "./unknown-daemon.ts";

/**
 * Whether a registry entry can be offered as a send target on the plugin
 * surface (#842).
 *
 * An entry that is invalid (bad host form) or switched off in settings names
 * no resolvable peer, exactly like a missing entry. Offering it as a healthy
 * send target only errors after send; the surface must show it as
 * unconfigured instead, with guidance to `x_comms_add_daemon` /
 * `x_comms_list_daemons` (see {@link unknownDaemonMessage}).
 */
export function isResolvableDaemon(
  daemon: Pick<RegistryDaemon, "name" | "valid"> | undefined,
  isEnabled: (name: string) => boolean,
): boolean {
  if (!daemon) return false;
  if (!daemon.valid) return false;
  if (!isEnabled(daemon.name)) return false;
  return true;
}

/**
 * Resolve a surface target the same way the send gate does, throwing the #851
 * error path ({@link UnresolvableTargetError} with the actionable diagnostic)
 * when it names nothing resolvable.
 */
export function assertSurfaceTargetResolvable(
  ref: string,
  daemons: readonly RegistryDaemon[],
  isEnabled: (name: string) => boolean,
): RegistryDaemon {
  const found = findDaemonByRef(daemons, ref);
  if (!isResolvableDaemon(found, isEnabled)) {
    throw new UnresolvableTargetError(ref, unknownDaemonMessage(ref));
  }
  return found as RegistryDaemon;
}
