import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { getFleetHarness } from "./testing/fleet-harness.js";
import type { UppidiIssue } from "../shared/contracts.js";

interface RenderedNode {
  type?: string;
  props?: Record<string, any>;
  children?: RenderedNode[] | string | Array<RenderedNode | string | null>;
}

function flatten(node: RenderedNode | null, out: RenderedNode[] = []): RenderedNode[] {
  if (!node) return out;
  out.push(node);
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (child && typeof child === "object") {
      flatten(child, out);
    }
  }
  return out;
}

function findByTestId(tree: RenderedNode | null, testId: string): RenderedNode[] {
  return flatten(tree).filter((n) => n.props?.testID === testId);
}

function findByAccessibilityLabel(tree: RenderedNode | null, labelPattern: RegExp): RenderedNode[] {
  return flatten(tree).filter((n) =>
    typeof n.props?.accessibilityLabel === "string" && labelPattern.test(n.props.accessibilityLabel),
  );
}

let React: typeof import("react");
let TestRenderer: typeof import("react-test-renderer");
let KANBAN_COLUMNS: typeof import("./kanban-board.js").KANBAN_COLUMNS;
let getIssueKanbanColumn: typeof import("./kanban-board.js").getIssueKanbanColumn;
let getColumnTransitions: typeof import("./kanban-board.js").getColumnTransitions;
let UppidiFleetKanbanBoard: typeof import("./kanban-board.js").UppidiFleetKanbanBoard;
let KanbanCard: typeof import("./kanban-board.js").KanbanCard;

const sampleIssues: UppidiIssue[] = [
  {
    number: 755,
    title: "Kanban board surface prototype",
    state: "open",
    repo: "paseo",
    status: "In progress",
    attention: "attention/1-agent",
    labels: ["state/1-wip", "kind/feature"],
    comments: 4,
    branch: "feat-755-kanban-board-prototype",
  },
  {
    number: 756,
    title: "Backlog item triage",
    state: "open",
    repo: "paseo",
    status: "Backlog",
    attention: "attention/0-orchestrator",
    labels: ["state/0-triage"],
    comments: 0,
  },
  {
    number: 750,
    title: "Review needed pull request",
    state: "open",
    repo: "paseo",
    status: "Review",
    attention: "attention/2-user",
    labels: ["state/2-review"],
    comments: 2,
  },
  {
    number: 740,
    title: "Completed bugfix",
    state: "closed",
    repo: "paseo",
    status: "Done",
    attention: "attention/1-agent",
    labels: ["state/4-done"],
    comments: 1,
  },
];

describe("UppidiFleetKanbanBoard (#755)", () => {
  before(async () => {
    await getFleetHarness();
    React = (await import("react")).default as any;
    TestRenderer = (await import("react-test-renderer")).default as any;
    const mod = await import("./kanban-board.js");
    KANBAN_COLUMNS = mod.KANBAN_COLUMNS;
    getIssueKanbanColumn = mod.getIssueKanbanColumn;
    getColumnTransitions = mod.getColumnTransitions;
    UppidiFleetKanbanBoard = mod.UppidiFleetKanbanBoard;
    KanbanCard = mod.KanbanCard;
  });

  it("defines the 4 canonical Forgejo Kanban columns in order", () => {
    assert.equal(KANBAN_COLUMNS.length, 4);
    assert.deepEqual(
      KANBAN_COLUMNS.map((c) => c.id),
      ["backlog", "in_progress", "review", "done"],
    );
    assert.equal(KANBAN_COLUMNS[0].stateLabel, "state/0-triage");
    assert.equal(KANBAN_COLUMNS[1].stateLabel, "state/1-wip");
    assert.equal(KANBAN_COLUMNS[2].stateLabel, "state/2-review");
    assert.equal(KANBAN_COLUMNS[3].stateLabel, "state/4-done");
  });

  describe("getIssueKanbanColumn mapping", () => {
    it("maps state/4-done and closed state to done column", () => {
      assert.equal(getIssueKanbanColumn(sampleIssues[3]), "done");
      assert.equal(
        getIssueKanbanColumn({
          number: 1,
          title: "done issue",
          state: "open",
          repo: "paseo",
          status: "Backlog",
          attention: "attention/1-agent",
          labels: ["state/4-done"],
          comments: 0,
        }),
        "done",
      );
    });

    it("maps state/2-review, state/3-verify and Review status to review column", () => {
      assert.equal(getIssueKanbanColumn(sampleIssues[2]), "review");
      assert.equal(
        getIssueKanbanColumn({
          number: 2,
          title: "verify issue",
          state: "open",
          repo: "paseo",
          status: "Backlog",
          attention: "attention/1-agent",
          labels: ["state/3-verify"],
          comments: 0,
        }),
        "review",
      );
    });

    it("maps state/1-wip and In progress status to in_progress column", () => {
      assert.equal(getIssueKanbanColumn(sampleIssues[0]), "in_progress");
    });

    it("defaults to backlog column for unclassified or state/0-triage issues", () => {
      assert.equal(getIssueKanbanColumn(sampleIssues[1]), "backlog");
      assert.equal(
        getIssueKanbanColumn({
          number: 3,
          title: "untagged issue",
          state: "open",
          repo: "paseo",
          status: "Backlog",
          attention: "attention/1-agent",
          labels: [],
          comments: 0,
        }),
        "backlog",
      );
    });
  });

  describe("getColumnTransitions", () => {
    it("returns expected transition actions for each column", () => {
      const backlogTransitions = getColumnTransitions("backlog");
      assert.deepEqual(
        backlogTransitions.map((t) => t.targetState),
        ["in_progress", "review"],
      );

      const inProgressTransitions = getColumnTransitions("in_progress");
      assert.deepEqual(
        inProgressTransitions.map((t) => t.targetState),
        ["backlog", "review"],
      );

      const reviewTransitions = getColumnTransitions("review");
      assert.deepEqual(
        reviewTransitions.map((t) => t.targetState),
        ["in_progress", "done"],
      );

      const doneTransitions = getColumnTransitions("done");
      assert.deepEqual(
        doneTransitions.map((t) => t.targetState),
        ["backlog", "in_progress"],
      );
    });
  });

  describe("KanbanCard rendering and interactions", () => {
    it("renders card details and handles select callback", () => {
      let selectedNumber: number | null = null;
      let renderer: any;
      TestRenderer.act(() => {
        renderer = TestRenderer.create(
          React.createElement(KanbanCard, {
            issue: sampleIssues[0],
            columnId: "in_progress",
            onSelect: (num: number) => {
              selectedNumber = num;
            },
          }),
        );
      });

      const tree = renderer.toJSON() as RenderedNode;
      const cardNodes = findByTestId(tree, "kanban-card-755");
      assert.equal(cardNodes.length, 1);

      const openIssueNodes = findByAccessibilityLabel(tree, /Open issue #755/);
      assert.ok(openIssueNodes.length >= 1, "card must have button to open issue");
      openIssueNodes[0].props?.onPress?.();
      assert.equal(selectedNumber, 755);
    });

    it("renders 1-click transition buttons and handles transition callback", () => {
      let transitionedTarget: string | null = null;
      let renderer: any;
      TestRenderer.act(() => {
        renderer = TestRenderer.create(
          React.createElement(KanbanCard, {
            issue: sampleIssues[0],
            columnId: "in_progress",
            onTransition: (_issue: any, target: string) => {
              transitionedTarget = target;
            },
          }),
        );
      });

      const tree = renderer.toJSON() as RenderedNode;
      // In progress column transitions: Backlog and Review
      const buttons = findByAccessibilityLabel(tree, /Move #755 to/);
      assert.equal(buttons.length, 2);

      // Second button moves to Review
      buttons[1].props?.onPress?.();
      assert.equal(transitionedTarget, "review");
    });
  });

  describe("UppidiFleetKanbanBoard rendering", () => {
    it("renders the 4 columns and groups issues into their respective columns", () => {
      let renderer: any;
      TestRenderer.act(() => {
        renderer = TestRenderer.create(
          React.createElement(UppidiFleetKanbanBoard, { issues: sampleIssues }),
        );
      });

      const tree = renderer.toJSON() as RenderedNode;
      for (const col of KANBAN_COLUMNS) {
        const colNodes = findByTestId(tree, `kanban-column-${col.id}`);
        assert.equal(colNodes.length, 1, `column ${col.id} must be present`);
      }

      // Check card presence
      for (const issue of sampleIssues) {
        const cardNodes = findByTestId(tree, `kanban-card-${issue.number}`);
        assert.equal(cardNodes.length, 1, `card #${issue.number} must be rendered`);
      }
    });

    it("filters board issues by search query", () => {
      let renderer: any;
      TestRenderer.act(() => {
        renderer = TestRenderer.create(
          React.createElement(UppidiFleetKanbanBoard, {
            issues: sampleIssues,
            filterQuery: "prototype",
          }),
        );
      });

      const tree = renderer.toJSON() as RenderedNode;
      // Only issue 755 has "prototype" in title
      const card755 = findByTestId(tree, "kanban-card-755");
      const card756 = findByTestId(tree, "kanban-card-756");
      assert.equal(card755.length, 1);
      assert.equal(card756.length, 0);
    });
  });
});
