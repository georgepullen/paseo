import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../bin/fleet-board-check.mjs");

describe("bin/fleet-board-check.mjs CLI", () => {
  test("--help displays usage and exits 0", async () => {
    const { stdout } = await execFileAsync("node", [cliPath, "--help"]);
    assert.match(stdout, /Usage: fleet-board-check/);
    assert.match(stdout, /--repo/);
    assert.match(stdout, /--role/);
    assert.match(stdout, /--dry-run/);
  });

  test("invalid role exits with code 2", async () => {
    await assert.rejects(
      async () => {
        await execFileAsync("node", [cliPath, "--role", "bad_role"]);
      },
      (err) => {
        assert.equal(err.code, 2);
        assert.match(err.stderr, /invalid role/);
        return true;
      },
    );
  });

  test("invalid stale-wip-hours exits with code 2", async () => {
    await assert.rejects(
      async () => {
        await execFileAsync("node", [cliPath, "--stale-wip-hours", "not-a-number"]);
      },
      (err) => {
        assert.equal(err.code, 2);
        assert.match(err.stderr, /non-negative number/);
        return true;
      },
    );
  });
});
