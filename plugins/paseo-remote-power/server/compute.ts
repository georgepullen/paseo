import { execFile } from "node:child_process";
import type { Compute } from "../shared/registry.ts";

/**
 * Compute snapshot over the host's `sshTarget`, read only while the host is up:
 * CPU, load, and memory from Linux /proc, plus the first GPU when nvidia-smi is
 * installed. A host where a field is unavailable (macOS, no GPU) reports null
 * for it, and an ssh failure reports no snapshot at all.
 */

const REMOTE_SCRIPT = [
  `c1=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5+$6}' /proc/stat 2>/dev/null)`,
  `sleep 0.4`,
  `c2=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5+$6}' /proc/stat 2>/dev/null)`,
  `printf 'CPU=%s\\n' "$(printf '%s\\n%s\\n' "$c1" "$c2" | awk 'NR==1{t=$1;i=$2} NR==2{dt=$1-t; di=$2-i; if (dt>0) printf "%d", 100*(dt-di)/dt}')"`,
  `printf 'NC=%s\\n' "$(nproc 2>/dev/null)"`,
  `printf 'LD=%s\\n' "$(cut -d' ' -f1 /proc/loadavg 2>/dev/null)"`,
  `printf 'MM=%s\\n' "$(free -m 2>/dev/null | awk '/^Mem:/{print $3"/"$2}')"`,
  `if command -v nvidia-smi >/dev/null 2>&1; then`,
  `  printf 'GPU=%s\\n' "$(nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,fan.speed --format=csv,noheader,nounits 2>/dev/null | head -n1)"`,
  `  printf 'GP=%s\\n' "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader 2>/dev/null | grep -c .)"`,
  `fi`,
].join("\n");

const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; value: Compute | null }>();

/** The ssh seam, so tests parse fixed output without a network. */
export type RunRemoteFn = (sshTarget: string, script: string) => Promise<string | null>;

// The script goes to `sh -s` on stdin so the remote login shell's syntax never matters.
const runRemote: RunRemoteFn = (sshTarget, script) =>
  new Promise((resolve) => {
    const child = execFile(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", sshTarget, "sh", "-s"],
      { timeout: 12_000, maxBuffer: 64 * 1024 },
      (error, stdout) => resolve(error ? null : stdout),
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(script);
  });

function number(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCompute(output: string): Compute | null {
  const fields = new Map<string, string>();
  for (const line of output.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) fields.set(line.slice(0, eq), line.slice(eq + 1).trim());
  }
  const [memUsed, memTotal] = (fields.get("MM") ?? "").split("/");
  const gpuLine = fields.get("GPU");
  const gpuParts = gpuLine ? gpuLine.split(",") : null;
  const compute: Compute = {
    cores: number(fields.get("NC")),
    cpu: number(fields.get("CPU")),
    load: fields.get("LD") || null,
    memUsedMiB: number(memUsed),
    memTotalMiB: number(memTotal),
    gpu:
      gpuParts && gpuParts.length >= 6
        ? {
            temp: number(gpuParts[0]),
            util: number(gpuParts[1]),
            vramUsedMiB: number(gpuParts[2]),
            vramTotalMiB: number(gpuParts[3]),
            power: number(gpuParts[4]),
            fan: number(gpuParts[5]),
            procs: number(fields.get("GP")),
          }
        : null,
  };
  const empty = compute.cpu === null && compute.memTotalMiB === null && compute.load === null && compute.gpu === null;
  return empty ? null : compute;
}

export async function readCompute(sshTarget: string, run: RunRemoteFn = runRemote): Promise<Compute | null> {
  const cached = cache.get(sshTarget);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const output = await run(sshTarget, REMOTE_SCRIPT);
  const value = output === null ? null : parseCompute(output);
  cache.set(sshTarget, { at: Date.now(), value });
  return value;
}
