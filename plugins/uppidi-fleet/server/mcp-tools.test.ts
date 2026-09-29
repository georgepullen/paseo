import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  FLEET_MCP_TOOLS,
  executeFleetCheckBoard,
  executeFleetWatchdogAudit,
  executeFleetTool,
  handleFleetToolList,
  handleFleetToolExecute,
  renderWatchdogAuditMarkdown,
} from "./mcp-tools.js";
import type { WatchdogAuditResult } from "./hook-router.js";

describe("fleet MCP tools and handlers", () => {
  test("FLEET_MCP_TOOLS declares typed tools with valid schemas", () => {
    assert.equal(FLEET_MCP_TOOLS.length, 2);

    const boardTool = FLEET_MCP_TOOLS.find((t) => t.name === "fleet_check_board");
    assert.ok(boardTool, "fleet_check_board tool must be registered");
    assert.equal(boardTool.inputSchema.type, "object");
    assert.ok(boardTool.inputSchema.properties.repo);
    assert.ok(boardTool.inputSchema.properties.role);
    assert.ok(boardTool.inputSchema.properties.force);
    assert.ok(boardTool.inputSchema.properties.dryRun);

    const watchdogTool = FLEET_MCP_TOOLS.find((t) => t.name === "fleet_watchdog_audit");
    assert.ok(watchdogTool, "fleet_watchdog_audit tool must be registered");
    assert.equal(watchdogTool.inputSchema.type, "object");
    assert.ok(watchdogTool.inputSchema.properties.recover);
    assert.ok(watchdogTool.inputSchema.properties.frontDeskId);
  });

  test("executeFleetCheckBoard rejects invalid role", async () => {
    const res = await executeFleetCheckBoard({ role: "invalid_role_name" });
    assert.equal(res.isError, true);
    assert.match(res.content[0]!.text, /Invalid role/);
  });

  test("executeFleetCheckBoard rejects negative staleWipHours", async () => {
    const res = await executeFleetCheckBoard({ staleWipHours: -1 });
    assert.equal(res.isError, true);
    assert.match(res.content[0]!.text, /staleWipHours must be a non-negative number/);
  });

  test("renderWatchdogAuditMarkdown renders clean state", () => {
    const cleanAudit: WatchdogAuditResult = {
      ok: true,
      timestamp: 1700000000000,
      audited: { orchestrators: 2, agents: 5, queues: 0 },
      anomalies: [],
    };
    const md = renderWatchdogAuditMarkdown(cleanAudit);
    assert.match(md, /All agents healthy/);
    assert.match(md, /5 agents/);
    assert.match(md, /2 orchestrators/);
  });

  test("renderWatchdogAuditMarkdown renders anomalies with taxonomy details", () => {
    const anomalyAudit: WatchdogAuditResult = {
      ok: false,
      timestamp: 1700000000000,
      audited: { orchestrators: 2, agents: 5, queues: 0 },
      anomalies: [
        {
          type: "TURN_CONCURRENCY_LOCK",
          agentId: "agent-123",
          severity: "high",
          taxonomy: ["TURN_CONCURRENCY_LOCK"],
          details: {
            TURN_CONCURRENCY_LOCK: "Locked in concurrent execution for 600s",
          },
          recovered: true,
          recoveryActions: ["aborted lock", "steered wake message"],
        },
      ],
    };
    const md = renderWatchdogAuditMarkdown(anomalyAudit);
    assert.match(md, /1 anomaly detected/);
    assert.match(md, /Agent `agent-123`/);
    assert.match(md, /HIGH/);
    assert.match(md, /TURN_CONCURRENCY_LOCK/);
    assert.match(md, /Locked in concurrent execution/);
    assert.match(md, /Recovered:.*Yes/);
  });

  test("executeFleetTool returns error for unknown tool", async () => {
    const res = await executeFleetTool("unknown_nonexistent_tool");
    assert.equal(res.isError, true);
    assert.match(res.content[0]!.text, /Unknown tool/);
  });

  test("handleFleetToolList returns available tools", async () => {
    const res = await handleFleetToolList({});
    assert.equal(res.ok, true);
    assert.equal(res.tools.length, 2);
    assert.deepEqual(
      res.tools.map((t) => t.name),
      ["fleet_check_board", "fleet_watchdog_audit"],
    );
  });

  test("handleFleetToolExecute handles unknown tool cleanly", async () => {
    const res = await handleFleetToolExecute({
      toolName: "nonexistent",
      arguments: {},
    });
    assert.equal(res.ok, false);
    assert.equal(res.isError, true);
    assert.match(res.error ?? "", /Unknown tool/);
  });
});
