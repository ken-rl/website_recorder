import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import {
  ComponentInteractionAnimator,
  installInteractionNavigationGuards,
  preflightComponentInteractions,
} from "./componentInteraction.js";

test("recovers a stale selector from the inspected label and role", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<button id="new-id" type="button">Activity</button>');
    const beats = [{
      target: {
        type: "selector" as const,
        selector: "#old-id",
        align: "center" as const,
        fallbackProgress: 0.4,
      },
      transitionMs: 1200,
      holdMs: 1300,
      interaction: {
        action: "hover" as const,
        candidateId: "interaction_02",
        label: "Activity",
        role: "button",
      },
    }];
    const result = await preflightComponentInteractions(page, beats);

    assert.equal(result.length, 1);
    assert.equal(result[0].recovered, true);
    assert.equal(result[0].label, "Activity");
    assert.match(beats[0].target.selector, /data-deio-interaction-key/);
  } finally {
    await browser.close();
  }
});

test("installs navigation guards under the source TypeScript runtime", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<button type="button">Open menu</button>');
    await installInteractionNavigationGuards(page);
    assert.equal(await page.evaluate(() => typeof window.open), "function");
  } finally {
    await browser.close();
  }
});

test("animates the semantically recovered target after preflight", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.setContent('<button id="new-id" type="button">Activity</button>');
    const animator = new ComponentInteractionAnimator(page);
    await animator.render({
      beatIndex: 0,
      selector: "#old-id",
      interaction: {
        action: "hover",
        candidateId: "interaction_02",
        label: "Activity",
        role: "button",
        zoomScale: 1.25,
        showCursor: true,
      },
      progress: 0.5,
    });
    const state = await page.evaluate(() => ({
      transform: document.body.style.transform,
      cursorOpacity: document.getElementById("__deio-scroll-cursor")?.style.opacity,
    }));
    assert.match(state.transform, /^scale\(/);
    assert.equal(state.cursorOpacity, "1");
    await animator.reset();
  } finally {
    await browser.close();
  }
});

test("does not recover an unsafe link as a click target", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<a href="/different">Open details</a>');
    await assert.rejects(
      preflightComponentInteractions(page, [{
        target: { type: "selector", selector: "#stale", fallbackProgress: 0.2 },
        transitionMs: 1200,
        holdMs: 1300,
        interaction: {
          action: "click",
          candidateId: "interaction_04",
          label: "Open details",
          role: "link",
        },
      }]),
      /could not safely resolve/,
    );
  } finally {
    await browser.close();
  }
});
