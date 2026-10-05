/**
 * Client-side gate for send surfaces (#842).
 *
 * Mirrors the server's `targetRegistryEntry` contract without node deps: a
 * daemon that is missing from the registry, invalid, or switched off in
 * settings names no resolvable peer and must never be offered as a healthy
 * send target. The surface shows it as unconfigured with guidance to
 * `x_comms_add_daemon` / `x_comms_list_daemons` instead, reusing the same
 * diagnostic the #851 send path refuses with.
 */

export interface SurfaceDaemon {
  name: string;
  valid: boolean;
  serverId?: string | null;
}

export function surfaceUnconfiguredMessage(name: string): string {
  return (
    `unknown daemon '${name}' — no registry entry for that name: register a direct host ` +
    `(host:port, tcp://…, unix://…, bare port) via x_comms_add_daemon, or a relay pairing ` +
    `offer from \`paseo daemon pair\`; list the registered names with x_comms_list_daemons`
  );
}

/** Absent or non-false means enabled; matches `resolveDaemonEnabled`. */
export function isSurfaceTargetEnabled(
  daemonEnabled: Record<string, boolean> | undefined,
  name: string,
): boolean {
  return daemonEnabled?.[name] !== false;
}

export function isSurfaceTargetResolvable(args: {
  daemon: string;
  daemons: readonly SurfaceDaemon[];
  daemonEnabled?: Record<string, boolean>;
}): boolean {
  // Mirror the server's findDaemonByRef: the send path addresses a target by
  // registry name or by serverId (daemonServerId ?? daemon), so both spellings
  // must resolve to the same entry. Name first, then serverId.
  const entry =
    args.daemons.find((d) => d.name === args.daemon) ??
    args.daemons.find((d) => !!d.serverId && d.serverId === args.daemon);
  if (!entry) return false;
  if (!entry.valid) return false;
  if (!isSurfaceTargetEnabled(args.daemonEnabled, entry.name)) return false;
  return true;
}

/**
 * Resolve a surface target before offering a send. Throws the actionable
 * diagnostic for an unresolvable entry so the caller shows it as unconfigured
 * rather than dispatching and only erroring after send.
 */
export function assertSurfaceTargetResolvable(args: {
  daemon: string;
  daemons: readonly SurfaceDaemon[];
  daemonEnabled?: Record<string, boolean>;
}): void {
  if (!isSurfaceTargetResolvable(args)) {
    throw new Error(surfaceUnconfiguredMessage(args.daemon));
  }
}
