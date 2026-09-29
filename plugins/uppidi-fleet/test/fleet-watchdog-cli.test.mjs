import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../bin/fleet-watchdog.mjs");

describe("bin/fleet-watchdog.mjs CLI", () => {
  test("--help displays usage and exits 0", async () => {
    const { stdout } = await execFileAsync("node", [cliPath, "--help"]);
    assert.match(stdout, /Usage: fleet-watchdog/);
    assert.match(stdout, /--front-desk-id/);
    assert.match(stdout, /--recover/);
    assert.match(stdout, /--recency-seconds/);
  });

  test("invalid recency-seconds exits with code 2", async () => {
    await assert.rejects(
      async () => {
        await execFileAsync("node", [cliPath, "--recency-seconds", "not-a-number"]);
      },
      (err) => {
        assert.equal(err.code, 2);
        assert.match(err.stderr, /non-negative number/);
        return true;
      },
    );
  });

  test("runs diagnostic health check with --json flag", async () => {
    // Run against empty temp dirs so it doesn't touch local daemon state
    let stdout = "";
    try {
      const res = await execFileAsync("node", [
        cliPath,
        "--no-recover",
        "--agents-dir",
        "/tmp",
        "--daemon-log-dir",
        "/tmp",
        "--json",
      ]);
      stdout = res.stdout;
    } catch (err) {
      if (err.code === 1) {
        stdout = err.stdout;
      } else {
        throw err;
      }
    }
    const parsed = JSON.parse(stdout);
    assert.equal(typeof parsed.ok, "boolean");
    assert.equal(typeof parsed.timestamp, "number");
    assert.ok(Array.isArray(parsed.anomalies));
  });
});
