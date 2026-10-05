import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

import {
  inspectPrimaryCheckout,
  evaluateWorkerWorkspaceGuard,
  evaluateWorkerSpawnWorkspace,
  resolveWorkerWorkspaceContext,
  setWorkspaceGuardExecFileAsyncForTest,
  WORKER_PRIMARY_CHECKOUT_ERROR,
  WORKER_LOCAL_ISOLATION_ERROR,
} from "./workspace-guard.js";
import { spawnPaseoAgent, setExecFileAsyncForTest } from "./agents.js";

describe("worktree-only dispatch guard (#918)", () => {
  beforeEach(() => {
    setWorkspaceGuardExecFileAsyncForTest(null);
  });

  afterEach(() => {
    setWorkspaceGuardExecFileAsyncForTest(null);
    setExecFileAsyncForTest(null);
  });

  it("detects the primary checkout when --git-dir equals --git-common-dir", async () => {
    setWorkspaceGuardExecFileAsyncForTest(async (_file, args) => {
      if (args.includes("--git-dir")) return { stdout: "/repo/.git\n" };
      if (args.includes("--git-common-dir")) return { stdout: "/repo/.git\n" };
      return { stdout: "" };
    });
    const result = await inspectPrimaryCheckout("/repo");
    assert.equal(result.isPrimaryCheckout, true);
    assert.equal(result.repoRoot, "/repo");
    assert.match(result.detail, /primary checkout/);
  });

  it("detects a linked worktree when --git-common-dir differs from --git-dir", async () => {
    setWorkspaceGuardExecFileAsyncForTest(async (_file, args) => {
      if (args.includes("--git-dir")) return { stdout: "/repo/.git/worktrees/feat-918\n" };
      if (args.includes("--git-common-dir")) return { stdout: "/repo/.git\n" };
      return { stdout: "" };
    });
    const result = await inspectPrimaryCheckout("/repo/.paseo/worktrees/2h0dw6vb/feat-918");
    assert.equal(result.isPrimaryCheckout, false);
    assert.equal(result.repoRoot, "/repo");
    assert.match(result.detail, /linked worktree/);
  });

  it("abstains on a non-git directory instead of refusing", async () => {
    setWorkspaceGuardExecFileAsyncForTest(async () => {
      throw new Error("fatal: not a git repository");
    });
    const result = await inspectPrimaryCheckout("/tmp/not-a-repo");
    assert.equal(result.isPrimaryCheckout, false);
    assert.match(result.detail, /not a git checkout/);
  });

  it("hard-refuses a worker whose inspection is the primary checkout", async () => {
    const decision = evaluateWorkerWorkspaceGuard({
      category: "worker",
      cwd: "/home/user/code/paseo",
      inspection: {
        isPrimaryCheckout: true,
        path: "/home/user/code/paseo",
        repoRoot: "/home/user/code/paseo",
        detail: "git-dir equals git-common-dir (primary checkout)",
      },
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.error, WORKER_PRIMARY_CHECKOUT_ERROR);
    assert.match(decision.error ?? "", /workspace create --isolation worktree/);
    assert.match(decision.error ?? "", /--workspace <workspace_id>/);
  });

  it("hard-refuses a worker whose workspace_path equals the project root", () => {
    const decision = evaluateWorkerWorkspaceGuard({
      category: "worker",
      cwd: "/home/user/code/paseo/",
      projectRootPath: "/home/user/code/paseo",
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.error, WORKER_PRIMARY_CHECKOUT_ERROR);
    assert.match(decision.reason, /equals the project root/);
  });

  it("refuses a local (non-worktree) workspace record", () => {
    const decision = evaluateWorkerWorkspaceGuard({
      category: "worker",
      workspaceId: "wks_paseo_main",
      inspection: {
        isPrimaryCheckout: false,
        path: "/home/user/code/paseo",
        detail: "linked worktree",
      },
      workspaceRecord: {
        cwd: "/home/user/code/paseo",
        kind: "local_checkout",
        isPaseoOwnedWorktree: false,
        mainRepoRoot: null,
      },
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.error, WORKER_LOCAL_ISOLATION_ERROR);
  });

  it("passes an isolated Paseo worktree", () => {
    const decision = evaluateWorkerWorkspaceGuard({
      category: "worker",
      cwd: "/home/user/.paseo/worktrees/2h0dw6vb/feat-918",
      inspection: {
        isPrimaryCheckout: false,
        path: "/home/user/.paseo/worktrees/2h0dw6vb/feat-918",
        repoRoot: "/home/user/code/paseo",
        detail: "linked worktree (git-dir differs from git-common-dir)",
      },
      workspaceRecord: {
        cwd: "/home/user/.paseo/worktrees/2h0dw6vb/feat-918",
        kind: "worktree",
        isPaseoOwnedWorktree: true,
        mainRepoRoot: "/home/user/code/paseo",
      },
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.error, undefined);
  });

  it("does not restrict orchestrator spawns (they run on the primary checkout)", () => {
    const decision = evaluateWorkerWorkspaceGuard({
      category: "orchestrator",
      cwd: "/home/user/code/paseo",
      inspection: {
        isPrimaryCheckout: true,
        path: "/home/user/code/paseo",
        repoRoot: "/home/user/code/paseo",
        detail: "git-dir equals git-common-dir (primary checkout)",
      },
    });
    assert.equal(decision.allowed, true);
  });
});

describe("worktree-only dispatch registry resolution (#918)", () => {
  it("resolves the project rootPath and worktree record for a workspaceId", async () => {
    const context = await resolveWorkerWorkspaceContext(
      { workspaceId: "wks_paseo_wt" },
      {
        workspaces: [
          {
            workspaceId: "wks_paseo_wt",
            cwd: "/home/user/.paseo/worktrees/2h0dw6vb/feat-918",
            projectId: "prj_paseo",
            kind: "worktree",
            isPaseoOwnedWorktree: true,
            mainRepoRoot: "/home/user/code/paseo",
          },
        ],
        projects: [{ projectId: "prj_paseo", rootPath: "/home/user/code/paseo" }],
      }
    );
    assert.equal(context.cwd, "/home/user/.paseo/worktrees/2h0dw6vb/feat-918");
    assert.equal(context.projectRootPath, "/home/user/code/paseo");
    assert.equal(context.workspaceRecord?.kind, "worktree");
  });

  it("leaves non-worker categories untouched without probing the workspace", async () => {
    const decision = await evaluateWorkerSpawnWorkspace({ category: "orchestrator", cwd: "/nope" });
    assert.equal(decision.allowed, true);
  });
});

describe("worktree-only dispatch spawn integration (#918)", () => {
  let root: string;
  let worktreeParent: string;
  let worktree: string;

  const git = (cwd: string, args: string[]): string =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@example.com",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
      },
    }).trim();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-918-root-"));
    worktreeParent = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-918-wt-"));
    worktree = path.join(worktreeParent, "checkout");
    git(root, ["init", "-b", "main"]);
    fs.writeFileSync(path.join(root, "README.md"), "hello\n");
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-m", "init"]);
    git(root, ["worktree", "add", "-b", "feat/918-guard", worktree]);
  });

  afterEach(() => {
    setExecFileAsyncForTest(null);
    try {
      git(root, ["worktree", "remove", "--force", worktree]);
    } catch {
      // best-effort cleanup
    }
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(worktreeParent, { recursive: true, force: true });
  });

  it("refuses a worker spawned in the primary checkout before any SDK/CLI call", async () => {
    let sdkCalled = false;
    let cliCalled = false;
    setExecFileAsyncForTest(async () => {
      cliCalled = true;
      return { stdout: JSON.stringify({ id: "should-not-spawn" }) };
    });
    const context: any = {
      paseo: {
        agents: {
          create: async () => {
            sdkCalled = true;
            return { agent: { id: "should-not-spawn" } };
          },
        },
      },
    };

    const res = await spawnPaseoAgent(
      {
        title: "worker",
        prompt: "do work",
        category: "worker",
        cwd: root,
      },
      context
    );

    assert.equal(res.ok, false);
    assert.equal(res.error, WORKER_PRIMARY_CHECKOUT_ERROR);
    assert.equal(sdkCalled, false);
    assert.equal(cliCalled, false);
  });

  it("allows a worker spawned in the linked worktree", async () => {
    let sdkCalled = false;
    const context: any = {
      paseo: {
        agents: {
          create: async () => {
            sdkCalled = true;
            return { agent: { id: "worker-ok" } };
          },
        },
      },
    };

    const res = await spawnPaseoAgent(
      {
        title: "worker",
        prompt: "do work",
        category: "worker",
        cwd: worktree,
      },
      context
    );

    assert.equal(res.ok, true);
    assert.equal(res.agentId, "worker-ok");
    assert.equal(sdkCalled, true);
  });
});
