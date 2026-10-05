import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getFleetHarness } from "./testing/fleet-harness.js";
import { agentsPayload, installPayloads } from "./testing/fleet-fixtures.js";
import { resolveCanonicalRepo } from "../shared/repo-identity.js";

/**
 * #724 cross-repo issue dropdown.
 *
 * The dashboard's global repo selector listed other repositories, but selecting
 * any repo other than the default (`xpufx-org/paseo`) showed an empty Work
 * Queue. The issues RPC input never carried the selected repo, so the server
 * kept answering the default repo while the client filtered the default repo's
 * issues against the selected repo — blank by construction, not because the
 * other repo had no issues.
 */

interface RenderedNode {
  props?: Record<string, any>;
  children?: RenderedNode[] | string | Array<RenderedNode | string | null>;
}

function flatten(node: RenderedNode | null, out: RenderedNode[] = []): RenderedNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of (Array.isArray(node.children) ? node.children : []) as RenderedNode[]) {
    flatten(child, out);
  }
  return out;
}

function findByAccessibilityLabel(tree: RenderedNode | null, label: string): RenderedNode[] {
  return flatten(tree).filter((n) => n.props?.accessibilityLabel === label);
}

/** Button labels and Text children render as string or node children in the test-renderer JSON. */
function renderedText(tree: RenderedNode | null): string {
  const parts: string[] = [];
  for (const node of flatten(tree)) {
    if (typeof node.props?.label === "string") parts.push(node.props.label);
    if (typeof node.children === "string") parts.push(node.children);
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (typeof child === "string") parts.push(child);
      }
    }
  }
  return parts.join(" ");
}

async function settle(harness: Awaited<ReturnType<typeof getFleetHarness>>, ms = 25) {
  await harness.TestRenderer.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

const DEFAULT_REPO = "xpufx-org/paseo";
const OTHER_REPO = "xpufx-org/2fado";
const OTHER_REPO_ISSUE = 5001;

/** The one canonical name each compact repo must render under (#888). */
const canonical = (repo: string) => `forge.mrs.uppidi.com/${repo}`;

/** Full-name enrolled roster so the selector lists the repos the test picks. */
function multiRepoAgentsPayload() {
  const base = agentsPayload() as any;
  return {
    ...base,
    enrolledRepos: [DEFAULT_REPO, OTHER_REPO, "xpufx-org/empty"],
  };
}

const defaultRepoIssues = () => ({
  ok: true,
  repo: DEFAULT_REPO,
  openCount: 2,
  inFlightCount: 1,
  reviewCount: 1,
  needsYouCount: 0,
  issues: [
    {
      number: 621,
      title: "paseo issue shown by default",
      state: "open",
      repo: "paseo",
      status: "In progress",
      attention: "attention/1-agent",
      labels: ["state/1-wip"],
      comments: 5,
      url: `https://forge.example/xpufx-org/paseo/issues/621`,
    },
    {
      number: 296,
      title: "paseo issue in review",
      state: "open",
      repo: "paseo",
      status: "Review",
      attention: "attention/0-orchestrator",
      labels: ["state/2-review"],
      comments: 12,
      url: `https://forge.example/xpufx-org/paseo/issues/296`,
    },
  ],
});

const otherRepoIssues = () => ({
  ok: true,
  repo: OTHER_REPO,
  openCount: 1,
  inFlightCount: 0,
  reviewCount: 1,
  needsYouCount: 0,
  issues: [
    {
      number: OTHER_REPO_ISSUE,
      title: "non-default repo issue that used to render blank",
      state: "open",
      repo: "2fado",
      status: "Review",
      attention: "attention/0-orchestrator",
      labels: ["state/2-review"],
      comments: 3,
      url: `https://forge.example/xpufx-org/2fado/issues/${OTHER_REPO_ISSUE}`,
    },
  ],
});

/** Stand-in answers per repository; an unlisted repo is a genuinely empty repo. */
const repoPayloads: Record<string, unknown> = {
  [DEFAULT_REPO]: defaultRepoIssues(),
  [OTHER_REPO]: otherRepoIssues(),
  "xpufx-org/empty": { ok: true, repo: "xpufx-org/empty", issues: [], openCount: 0 },
};

/** Switches to the Work Queue tab; the harness's own tabIndex press does not commit. */
async function openWorkQueueTab(harness: any, renderer: any) {
  const tabs = flatten(renderer.toJSON()).filter(
    (n) => n.props?.accessibilityRole === "tab" && typeof n.props?.onPress === "function",
  );
  await harness.TestRenderer.act(async () => {
    tabs[1]?.props?.onPress();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function renderFleetWithIssueResolver() {
  const harness = await getFleetHarness();
  installPayloads(harness.payloads, multiRepoAgentsPayload());

  let lastIssuesInput: Record<string, any> | undefined;
  harness.payloads["uppidi-fleet.issues"] = (input: any) => {
    lastIssuesInput = input;
    const repo = resolveCanonicalRepo(input?.repo)?.compact ?? input?.repo ?? DEFAULT_REPO;
    return repoPayloads[repo] ?? {
      ok: true,
      repo,
      issues: [],
      openCount: 0,
      inFlightCount: 0,
      reviewCount: 0,
      needsYouCount: 0,
    };
  };

  const { root, renderer } = await harness.renderPanelAtWidth(900, 1);
  await openWorkQueueTab(harness, renderer);
  return { harness, lastIssuesInputRef: () => lastIssuesInput, tree: renderer.toJSON(), root, renderer };
}

async function press(harness: Awaited<ReturnType<typeof getFleetHarness>>, renderer: any, label: string) {
  const node = findByAccessibilityLabel(renderer.toJSON(), label).find(
    (n) => typeof n.props?.onPress === "function",
  );
  assert.ok(node, `a pressable node labelled ${label} must be present in the render`);
  await harness.TestRenderer.act(async () => {
    node.props?.onPress();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

/** The RPC answer lands a few commits after the selection; wait for the text. */
async function eventually(
  harness: Awaited<ReturnType<typeof getFleetHarness>>,
  renderer: any,
  match: RegExp,
): Promise<string> {
  let text = "";
  for (let i = 0; i < 60; i += 1) {
    text = renderedText(renderer.toJSON());
    if (match.test(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return text;
}

describe("#724 cross-repo Work Queue dropdown", () => {
  it("fetches and renders the selected non-default repo's issues", async () => {
    const { harness, lastIssuesInputRef, tree, renderer } = await renderFleetWithIssueResolver();

    const trigger = findByAccessibilityLabel(tree, "All Repositories").find(
      (n) => typeof n.props?.onPress === "function",
    );
    assert.ok(trigger, "the Work Queue tab must expose the repo selector trigger");

    await harness.TestRenderer.act(async () => {
      trigger.props?.onPress();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await press(harness, renderer, canonical(OTHER_REPO));

    await eventually(harness, renderer, new RegExp(`#${OTHER_REPO_ISSUE}`));
    const labels = renderedText(renderer.toJSON());

    assert.equal(
      lastIssuesInputRef()?.repo,
      canonical(OTHER_REPO),
      "selecting a repo must issue the issues RPC against that repo's canonical name, not the default",
    );
    assert.match(
      labels,
      new RegExp(`#${OTHER_REPO_ISSUE}`),
      "the non-default repo's issue must render in the Work Queue table",
    );
    assert.match(
      labels,
      /Repo: forge\.mrs\.uppidi\.com\/xpufx-org\/2fado/,
      "the metrics bar must name the selected repo canonically",
    );
  });

  it("keeps rendering the default repo's issues when it is re-selected", async () => {
    const { harness, lastIssuesInputRef, tree, renderer } = await renderFleetWithIssueResolver();

    const trigger = findByAccessibilityLabel(tree, "All Repositories").find(
      (n) => typeof n.props?.onPress === "function",
    );
    assert.ok(trigger);
    await harness.TestRenderer.act(async () => {
      trigger.props?.onPress();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await press(harness, renderer, canonical(DEFAULT_REPO));

    await eventually(harness, renderer, /#621/);
    assert.equal(lastIssuesInputRef()?.repo, canonical(DEFAULT_REPO));
    assert.match(
      renderedText(renderer.toJSON()),
      /#621/,
      "the default repo's issues must still render",
    );
  });

  it("says the repo has no issues rather than showing the filter-blank state", async () => {
    const { harness, tree, renderer } = await renderFleetWithIssueResolver();

    const trigger = findByAccessibilityLabel(tree, "All Repositories").find(
      (n) => typeof n.props?.onPress === "function",
    );
    assert.ok(trigger);
    await harness.TestRenderer.act(async () => {
      trigger.props?.onPress();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await press(harness, renderer, canonical("xpufx-org/empty"));

    const labels = await eventually(
      harness,
      renderer,
      /No open issues in forge\.mrs\.uppidi\.com\/xpufx-org\/empty/,
    );
    assert.match(
      labels,
      /No open issues in forge\.mrs\.uppidi\.com\/xpufx-org\/empty/,
      "an authoritatively empty repo must render its own empty state, not the filter-blank one",
    );
  });
});
