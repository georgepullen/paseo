import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}
if (!process.env.HOOK_STATE_DIR) {
  process.env.HOOK_STATE_DIR = path.join(os.tmpdir(), `paseo-fleet-skills-test-${process.pid}`);
}

import {
  FLEET_SKILL_DEFINITIONS,
  getBundledSkillPath,
  getEffectiveSkillPath,
  handleUppidiSetSkill,
  handleUppidiSkills,
  readBundledSkillContent,
  resolveEffectiveSkill,
  setSkillContent,
  setSkillsBaseDirForTest,
} from "./skills.js";
import { handleUppidiAddOrchestrator, setExecFileAsyncForTest } from "./agents.js";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";

const NO_CONTEXT = {} as PluginHandlerContext;

function makeBaseDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "paseo-fleet-skills-"));
}

describe("fleet skills effective resolution & overrides (#883)", () => {
  let baseDir: string;

  before(() => {
    baseDir = makeBaseDir();
    setSkillsBaseDirForTest(baseDir);
  });

  after(() => {
    setSkillsBaseDirForTest(null);
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it("lists every bundled skill with bundled origin by default", () => {
    for (const def of FLEET_SKILL_DEFINITIONS) {
      const resolved = resolveEffectiveSkill(def.id);
      assert.equal(resolved.origin, "bundled");
      assert.equal(resolved.content, readBundledSkillContent(def.id));
      assert.equal(resolved.effectivePath, getBundledSkillPath(def.id));
      assert.ok(resolved.content.length > 0);
    }
  });

  it("RPC list returns all fleet skills with title, content, and origin", async () => {
    const res = await handleUppidiSkills({}, NO_CONTEXT);
    assert.equal(res.ok, true);
    assert.deepEqual(
      res.skills.map((s) => s.id),
      FLEET_SKILL_DEFINITIONS.map((d) => d.id),
    );
    assert.ok(res.skills.every((s) => s.origin === "bundled"));
    assert.ok(res.skills.every((s) => s.content.length > 0));
    assert.ok(res.skills.every((s) => s.title.length > 0));
  });

  it("save persists an override under plugin-data without touching the checkout", async () => {
    const bundledBefore = readBundledSkillContent("orchestrator");
    const sentinel = "# Orchestrator override\n\nsentinel-883\n";

    const saveRes = await handleUppidiSetSkill(
      { id: "orchestrator", content: sentinel },
      NO_CONTEXT,
    );
    assert.equal(saveRes.ok, true);
    assert.equal(saveRes.skill?.origin, "override");
    assert.equal(saveRes.skill?.content, sentinel);

    const overridePath = path.join(baseDir, "uppidi-fleet", "skills", "orchestrator.md");
    assert.ok(fs.existsSync(overridePath), "override markdown should exist under plugin-data");
    assert.equal(fs.readFileSync(overridePath, "utf8"), sentinel);

    // The effective resolution now reads the override, and the spawn prompt
    // points at the override file rather than the bundled copy.
    const resolved = resolveEffectiveSkill("orchestrator");
    assert.equal(resolved.origin, "override");
    assert.equal(resolved.content, sentinel);
    assert.equal(resolved.effectivePath, overridePath);
    assert.equal(getEffectiveSkillPath("orchestrator"), overridePath);

    // The bundled checkout copy and ~/.agents are never written.
    assert.equal(readBundledSkillContent("orchestrator"), bundledBefore);
    assert.ok(overridePath.startsWith(baseDir), "override should live under the plugin-data base dir");
    assert.ok(!overridePath.startsWith(path.join(os.homedir(), ".agents")));
  });

  it("reset removes the override and restores the bundled text", async () => {
    const sentinel = "# temporary override\n";
    await handleUppidiSetSkill({ id: "front-desk", content: sentinel }, NO_CONTEXT);
    const overridePath = path.join(baseDir, "uppidi-fleet", "skills", "front-desk.md");
    assert.ok(fs.existsSync(overridePath));

    const resetRes = await handleUppidiSetSkill({ id: "front-desk", content: null }, NO_CONTEXT);
    assert.equal(resetRes.ok, true);
    assert.equal(resetRes.skill?.origin, "bundled");
    assert.equal(resetRes.skill?.content, readBundledSkillContent("front-desk"));
    assert.equal(fs.existsSync(overridePath), false, "override file should be removed");
  });

  it("rejects an unknown skill id", async () => {
    const res = await handleUppidiSetSkill({ id: "not-a-skill", content: "x" }, NO_CONTEXT);
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /Unknown skill id/);
  });

  it("setSkillContent reports unknown ids", () => {
    assert.throws(() => setSkillContent("nope", "x"), /Unknown skill id/);
  });
});

describe("spawned agents use the effective skill (#883)", () => {
  let baseDir: string;

  before(() => {
    baseDir = makeBaseDir();
    setSkillsBaseDirForTest(baseDir);
  });

  after(() => {
    setSkillsBaseDirForTest(null);
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it("handleUppidiAddOrchestrator prompt points at the saved override", async () => {
    const sentinel = "# Orchestrator override for spawn test\n\nonly-override-body-883\n";
    await handleUppidiSetSkill({ id: "orchestrator", content: sentinel }, NO_CONTEXT);

    let capturedPayload: any = null;
    const mockContext: any = {
      paseo: {
        agents: {
          create: async (opts: any) => {
            capturedPayload = opts;
            return {
              agent: {
                id: "agent-orch-883",
                name: opts.title,
                role: opts.role,
                status: "running",
              },
            };
          },
        },
      },
    };

    setExecFileAsyncForTest(async (cmd: string, args: readonly string[]) => {
      if (cmd === "paseo" && args[0] === "workspace" && args[1] === "ls") {
        return {
          stdout: JSON.stringify([
            {
              workspaceId: "wks_883",
              project: "sample-883",
              name: "Main",
              isolation: "local",
              cwd: "/home/user/code/sample-883",
            },
          ]),
        };
      }
      return { stdout: "[]" };
    });

    try {
      const res = await handleUppidiAddOrchestrator(
        { repo: "xpufx-org/sample-883" },
        mockContext,
      );
      assert.equal(res.ok, true);
      assert.ok(capturedPayload, "spawn payload should be captured");

      const overridePath = path.join(baseDir, "uppidi-fleet", "skills", "orchestrator.md");
      assert.ok(
        capturedPayload.prompt.includes(overridePath),
        "orchestrator prompt must point at the override file",
      );
      assert.ok(
        !capturedPayload.prompt.includes("examples/skills/orchestrator/SKILL.md"),
        "orchestrator prompt must not fall back to the bundled path when an override exists",
      );
      assert.equal(fs.readFileSync(overridePath, "utf8"), sentinel);
      // Workers are pointed at the effective coding-agent skill too.
      assert.ok(
        capturedPayload.prompt.includes(
          path.join(baseDir, "uppidi-fleet", "skills", "coding-agent.md"),
        ) ||
          capturedPayload.prompt.includes(getBundledSkillPath("coding-agent")),
      );
    } finally {
      setExecFileAsyncForTest(null);
    }
  });
});
