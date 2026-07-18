import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { installMediaClock } from "./mediaClock.js";

test("installs the media clock without TypeScript runtime helpers", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await installMediaClock(page);
    await page.goto("about:blank");
    await page.setContent(`
      <style>
        @keyframes drift { to { transform: translateX(100px); } }
        #animated { animation: drift 10s linear infinite; }
      </style>
      <div id="animated">Animated</div>
      <video muted></video>
    `);

    const state = await page.evaluate(() => {
      const clock = (window as any).__websiterecorderMediaClock;
      clock.sync(0.25);
      return {
        exists: Boolean(clock),
        videoRate: document.querySelector("video")!.playbackRate,
        animationRate: document.getAnimations()[0]?.playbackRate,
      };
    });

    assert.deepEqual(pageErrors, []);
    assert.equal(state.exists, true);
    assert.equal(state.videoRate, 0.25);
    assert.equal(state.animationRate, 0.25);
  } finally {
    await browser.close();
  }
});
