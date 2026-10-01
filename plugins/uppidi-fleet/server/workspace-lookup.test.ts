import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveWorkspaceForRepo, type WorkspaceRecord, type ProjectRecord } from "./workspace-lookup.js";

describe("workspace-lookup deterministic resolution (#793)", () => {
  const sampleProjects: ProjectRecord[] = [
    {
      projectId: "prj_paseo",
      displayName: "paseo",
      projectKey: "remote:forge.mrs.uppidi.com:222/xpufx-org/paseo",
      rootPath: "/home/user/code/paseo",
    },
    {
      projectId: "prj_uppidi",
      displayName: "uppidi",
      projectKey: "remote:forge.example.com:222/xpufx/uppidi",
      rootPath: "/home/user/code/uppidi",
    },
  ];

  const sampleWorkspaces: WorkspaceRecord[] = [
    {
      workspaceId: "wks_paseo_main",
      projectId: "prj_paseo",
      cwd: "/home/user/code/paseo",
      displayName: "main",
      mainRepoRoot: null,
      archivedAt: null,
      updatedAt: "2026-09-20T10:00:00Z",
    },
    {
      workspaceId: "wks_paseo_worktree",
      projectId: "prj_paseo",
      cwd: "/home/user/.paseo/worktrees/123/feat-793",
      displayName: "feat-793",
      mainRepoRoot: "/home/user/code/paseo",
      isPaseoOwnedWorktree: true,
      archivedAt: null,
      updatedAt: "2026-09-25T10:00:00Z",
    },
    {
      workspaceId: "wks_paseo_archived",
      projectId: "prj_paseo",
      cwd: "/home/user/code/old-paseo",
      displayName: "old",
      archivedAt: "2026-01-01T00:00:00Z",
    },
    {
      workspaceId: "wks_uppidi_main",
      projectId: "prj_uppidi",
      cwd: "/home/user/code/uppidi",
      displayName: "main",
      mainRepoRoot: null,
      archivedAt: null,
      updatedAt: "2026-09-20T10:00:00Z",
    },
  ];

  it("matches owner/repo slug deterministically to main repository workspace", () => {
    const res = resolveWorkspaceForRepo("xpufx-org/paseo", {
      workspacesData: sampleWorkspaces,
      projectsData: sampleProjects,
    });
    assert.ok(res);
    assert.equal(res.workspaceId, "wks_paseo_main");
    assert.equal(res.cwd, "/home/user/code/paseo");
  });

  it("matches full remote URL and git suffix to main workspace", () => {
    const res = resolveWorkspaceForRepo("https://forge.mrs.uppidi.com/xpufx-org/paseo.git", {
      workspacesData: sampleWorkspaces,
      projectsData: sampleProjects,
    });
    assert.ok(res);
    assert.equal(res.workspaceId, "wks_paseo_main");
    assert.equal(res.cwd, "/home/user/code/paseo");
  });

  it("prioritizes active root workspace over ephemeral worktree even if worktree was updated later", () => {
    // wks_paseo_worktree has updatedAt 2026-09-25 vs wks_paseo_main 2026-09-20
    const res = resolveWorkspaceForRepo("xpufx-org/paseo", {
      workspacesData: sampleWorkspaces,
      projectsData: sampleProjects,
    });
    assert.ok(res);
    assert.equal(res.workspaceId, "wks_paseo_main");
  });

  it("penalizes archived workspaces heavily", () => {
    const onlyArchived: WorkspaceRecord[] = [
      {
        workspaceId: "wks_archived",
        projectId: "prj_paseo",
        cwd: "/home/user/code/old-paseo",
        archivedAt: "2026-01-01T00:00:00Z",
      },
    ];
    const res = resolveWorkspaceForRepo("xpufx-org/paseo", {
      workspacesData: onlyArchived,
      projectsData: sampleProjects,
    });
    // Still resolves if it's the only match, but score is penalized
    assert.ok(res);
    assert.equal(res.workspaceId, "wks_archived");
    assert.ok((res.score ?? 0) < 600);
  });

  it("matches repo basename to project displayName", () => {
    const res = resolveWorkspaceForRepo("uppidi", {
      workspacesData: sampleWorkspaces,
      projectsData: sampleProjects,
    });
    assert.ok(res);
    assert.equal(res.workspaceId, "wks_uppidi_main");
  });

  it("returns null for non-matching unknown repository", () => {
    const res = resolveWorkspaceForRepo("nonexistent-org/unknown-project-xyz", {
      workspacesData: sampleWorkspaces,
      projectsData: sampleProjects,
    });
    assert.equal(res, null);
  });

  it("returns null for empty or invalid repo slug", () => {
    assert.equal(resolveWorkspaceForRepo("", { workspacesData: sampleWorkspaces }), null);
    assert.equal(resolveWorkspaceForRepo("   ", { workspacesData: sampleWorkspaces }), null);
    assert.equal(resolveWorkspaceForRepo(null as any, { workspacesData: sampleWorkspaces }), null);
  });
});
