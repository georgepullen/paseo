import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCompute, readCompute } from "./compute.ts";

test("parses a Linux host with an NVIDIA GPU", () => {
  const compute = parseCompute(
    "CPU=2\nNC=24\nLD=0.60\nMM=11897/64106\nGPU=45, 0, 23136, 24576, 35.21, 45\nGP=1\n",
  );
  assert.deepEqual(compute, {
    cores: 24,
    cpu: 2,
    load: "0.60",
    memUsedMiB: 11897,
    memTotalMiB: 64106,
    gpu: { temp: 45, util: 0, vramUsedMiB: 23136, vramTotalMiB: 24576, power: 35.21, fan: 45, procs: 1 },
  });
});

test("a host without a GPU or /proc reports what it has, or nothing", () => {
  assert.equal(parseCompute("CPU=10\nNC=8\nLD=1.20\nMM=2000/8000\n")?.gpu, null);
  assert.equal(parseCompute("CPU=\nNC=\nLD=\nMM=\n"), null);
  // nvidia-smi present but reporting [N/A] fields degrades per field.
  assert.equal(parseCompute("GPU=50, [N/A], 100, 200, [N/A], [N/A]\n")?.gpu?.power, null);
});

test("an ssh failure yields no snapshot", async () => {
  assert.equal(await readCompute("unreachable.example", async () => null), null);
});
