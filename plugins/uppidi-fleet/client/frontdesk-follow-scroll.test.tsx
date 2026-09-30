import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import React from "react";
import { getFleetHarness } from "./testing/fleet-harness.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const treeViewSrc = readFileSync(join(HERE, "tree-view.tsx"), "utf8");

describe("FrontDeskWatchDrawer follow-scroll and pause/resume (#815)", () => {
  it("includes follow-scroll state, ScrollView ref, onScroll, and resume button in source", () => {
    // 1. Ref & ScrollView props
    assert.match(treeViewSrc, /const\s+scrollViewRef\s*=\s*useRef<ScrollView>/);
    assert.match(treeViewSrc, /const\s+\[followScroll,\s*setFollowScroll\]\s*=\s*useState\(true\)/);
    assert.match(treeViewSrc, /ref=\{scrollViewRef\}/);
    assert.match(treeViewSrc, /onScroll=\{handleScroll\}/);
    assert.match(treeViewSrc, /scrollEventThrottle=\{16\}/);
    assert.match(treeViewSrc, /onContentSizeChange=\{handleContentSizeChange\}/);

    // 2. Scroll threshold logic
    assert.match(treeViewSrc, /distanceFromBottom\s*<=\s*24/);
    assert.match(treeViewSrc, /scrollToEnd\(\{\s*animated:\s*true\s*\}\)/);

    // 3. Resume scroll button
    assert.match(treeViewSrc, /label="Resume scroll"/);
    assert.match(treeViewSrc, /onPress=\{handleResumeScroll\}/);
    assert.match(treeViewSrc, /frontdesk-resume-scroll-button/);
  });

  it("auto-scrolls on initial mount with items and respects followScroll", async () => {
    const harness = await getFleetHarness();
    const { FrontDeskWatchDrawer } = await import("./tree-view.js");

    const mockItems = [
      {
        id: "act-1",
        timestamp: Date.now() - 2000,
        type: "user",
        title: "User prompt",
        summary: "Please review PR #815",
      },
      {
        id: "act-2",
        timestamp: Date.now() - 1000,
        type: "assistant",
        title: "Agent response",
        summary: "Reviewing now",
      },
    ];

    harness.payloads["uppidi-fleet.front-desk.activity"] = {
      agentId: "fd-agent-1",
      agentName: "Front Desk",
      items: mockItems,
      totalCount: 2,
      signalCount: 2,
    };

    const mockNode: any = {
      agent: {
        id: "fd-agent-1",
        shortId: "fd1",
        name: "Front Desk",
        status: "idle",
      },
      depth: 0,
      children: [],
    };

    const colors = {
      foreground: "#ffffff",
      foregroundMuted: "#888888",
      surface0: "#111111",
      surface1: "#222222",
      surface2: "#333333",
      border: "#444444",
      accent: "#3b82f6",
      primary: "#3b82f6",
    };

    const typography = {
      body: { fontSize: 13 },
      heading: { fontSize: 16 },
      caption: { fontSize: 11 },
    };

    const { renderer } = await harness.renderWithRoot(
      <FrontDeskWatchDrawer
        node={mockNode}
        isOpen={true}
        onToggle={() => {}}
        colors={colors}
        typography={typography}
      />
    );

    await harness.TestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    const root = renderer.root;
    const scrollView = root.findByProps({ nestedScrollEnabled: true });
    assert.ok(scrollView, "timeline ScrollView must be rendered");
    assert.equal(typeof scrollView.props.onScroll, "function", "ScrollView must have onScroll handler");
    assert.equal(scrollView.props.scrollEventThrottle, 16, "ScrollView must throttle scroll events");

    // Initially at bottom, follow-scroll is active so resume button should not be displayed
    const resumeButtons = root.findAllByProps({ testID: "frontdesk-resume-scroll-button" });
    assert.equal(resumeButtons.length, 0, "Resume button should not appear when follow-scroll is active");
  });

  it("pauses follow-scroll on manual scroll up and displays Resume scroll button", async () => {
    const harness = await getFleetHarness();
    const { FrontDeskWatchDrawer } = await import("./tree-view.js");

    const mockItems = [
      {
        id: "act-1",
        timestamp: Date.now() - 3000,
        type: "user",
        title: "User prompt",
        summary: "Initial command",
      },
      {
        id: "act-2",
        timestamp: Date.now() - 1000,
        type: "dispatch",
        title: "Dispatch",
        summary: "Running worker",
      },
    ];

    harness.payloads["uppidi-fleet.front-desk.activity"] = {
      agentId: "fd-agent-2",
      agentName: "Front Desk",
      items: mockItems,
      totalCount: 2,
      signalCount: 2,
    };

    const mockNode: any = {
      agent: {
        id: "fd-agent-2",
        shortId: "fd2",
        name: "Front Desk",
        status: "busy",
      },
      depth: 0,
      children: [],
    };

    const colors = {
      foreground: "#ffffff",
      foregroundMuted: "#888888",
      surface0: "#111111",
      surface1: "#222222",
      surface2: "#333333",
      border: "#444444",
      accent: "#3b82f6",
      primary: "#3b82f6",
    };

    const typography = {
      body: { fontSize: 13 },
      heading: { fontSize: 16 },
      caption: { fontSize: 11 },
    };

    const { renderer } = await harness.renderWithRoot(
      <FrontDeskWatchDrawer
        node={mockNode}
        isOpen={true}
        onToggle={() => {}}
        colors={colors}
        typography={typography}
      />
    );

    await harness.TestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    const root = renderer.root;
    const scrollView = root.findByProps({ nestedScrollEnabled: true });

    // Simulate user scrolling up (contentOffset.y is 100, while layoutHeight is 200 and contentSize is 1000)
    // distanceFromBottom = 1000 - (200 + 100) = 700 > 24
    await harness.TestRenderer.act(() => {
      scrollView.props.onScroll({
        nativeEvent: {
          layoutMeasurement: { height: 200, width: 300 },
          contentOffset: { y: 100, x: 0 },
          contentSize: { height: 1000, width: 300 },
        },
      });
    });

    // Resume button should now be rendered
    const resumeContainer = root.findByProps({ testID: "frontdesk-resume-scroll-button" });
    assert.ok(resumeContainer, "Resume scroll container must be displayed when scrolled up");
    const resumeBtn = root.findByProps({ label: "Resume scroll" });
    assert.ok(resumeBtn, "Resume scroll button must be rendered");

    // Clicking Resume button restores follow-scroll and hides the button
    await harness.TestRenderer.act(() => {
      resumeBtn.props.onPress();
    });

    const resumeAfterPress = root.findAllByProps({ testID: "frontdesk-resume-scroll-button" });
    assert.equal(resumeAfterPress.length, 0, "Resume button must disappear after user clicks resume");
  });

  it("automatically resumes follow-scroll when user scrolls back to bottom", async () => {
    const harness = await getFleetHarness();
    const { FrontDeskWatchDrawer } = await import("./tree-view.js");

    const mockItems = [
      {
        id: "act-1",
        timestamp: Date.now() - 2000,
        type: "decision",
        title: "Decision",
        summary: "Decided to run tests",
      },
    ];

    harness.payloads["uppidi-fleet.front-desk.activity"] = {
      agentId: "fd-agent-3",
      agentName: "Front Desk",
      items: mockItems,
      totalCount: 1,
      signalCount: 1,
    };

    const mockNode: any = {
      agent: {
        id: "fd-agent-3",
        shortId: "fd3",
        name: "Front Desk",
        status: "idle",
      },
      depth: 0,
      children: [],
    };

    const colors = {
      foreground: "#ffffff",
      foregroundMuted: "#888888",
      surface0: "#111111",
      surface1: "#222222",
      surface2: "#333333",
      border: "#444444",
      accent: "#3b82f6",
      primary: "#3b82f6",
    };

    const typography = {
      body: { fontSize: 13 },
      heading: { fontSize: 16 },
      caption: { fontSize: 11 },
    };

    const { renderer } = await harness.renderWithRoot(
      <FrontDeskWatchDrawer
        node={mockNode}
        isOpen={true}
        onToggle={() => {}}
        colors={colors}
        typography={typography}
      />
    );

    await harness.TestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    const root = renderer.root;
    const scrollView = root.findByProps({ nestedScrollEnabled: true });

    // 1. Scroll up
    await harness.TestRenderer.act(() => {
      scrollView.props.onScroll({
        nativeEvent: {
          layoutMeasurement: { height: 200, width: 300 },
          contentOffset: { y: 200, x: 0 },
          contentSize: { height: 1000, width: 300 },
        },
      });
    });

    assert.ok(
      root.findAllByProps({ testID: "frontdesk-resume-scroll-button" }).length > 0,
      "Resume button must appear when scrolled up"
    );

    // 2. Scroll back to bottom:
    // layoutMeasurement.height (200) + contentOffset.y (790) = 990 >= 1000 - 24 (976)
    await harness.TestRenderer.act(() => {
      scrollView.props.onScroll({
        nativeEvent: {
          layoutMeasurement: { height: 200, width: 300 },
          contentOffset: { y: 790, x: 0 },
          contentSize: { height: 1000, width: 300 },
        },
      });
    });

    assert.equal(
      root.findAllByProps({ testID: "frontdesk-resume-scroll-button" }).length,
      0,
      "Resume button must disappear when user scrolls back to the bottom"
    );
  });
});
