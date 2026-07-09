import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import type { Page } from "playwright";
import type { BezierControlPoints } from "./curves.js";
import { applyScrollCurve } from "./scrollEasing.js";
import type { FrameRecorder } from "../capture/frameRecorder.js";

/**
 * Sites like ui8.ai listen to wheel events and accumulate deltaY into a smoothed
 * scroll progress. Steady 60Hz ticks with small deltas work far better than
 * synthesizeScrollGesture or sparse high-delta bursts.
 */
const WHEEL_TICK_HZ = 60;

export interface VirtualScrollOptions {
  durationMs: number;
  viewportWidth: number;
  viewportHeight: number;
  wheelBudget: number;
  bezier: BezierControlPoints;
  frameRecorder?: FrameRecorder;
}

async function waitUntil(deadlineMs: number) {
  const delayMs = deadlineMs - performance.now();
  if (delayMs > 0) {
    await sleep(delayMs);
  }
}

export async function runVirtualScroll(
  page: Page,
  options: VirtualScrollOptions,
): Promise<{ frames: { file: string; progress: number }[] }> {
  const { durationMs, viewportWidth, viewportHeight, wheelBudget, frameRecorder } =
    options;
  const centerX = Math.floor(viewportWidth / 2);
  const centerY = Math.floor(viewportHeight / 2);
  const tickMs = 1000 / WHEEL_TICK_HZ;
  const tickCount = Math.max(1, Math.ceil(durationMs / tickMs));

  const frames: { file: string; progress: number }[] = [];

  try {
    await page.mouse.move(centerX, centerY);
    await page.mouse.click(centerX, centerY);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: centerX,
      y: centerY,
    });

    const wheelStep = wheelBudget / tickCount;

    for (let tick = 0; tick <= tickCount; tick += 1) {
      const progress = tick / tickCount;

      if (tick > 0) {
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: centerX,
          y: centerY,
          deltaX: 0,
          deltaY: Math.round(wheelStep),
        });
        // Let the website JS process the event and render
        await sleep(frameRecorder ? 20 : tickMs);
      }

      if (frameRecorder) {
        await frameRecorder.writeFrame(page);
        const filename = `frame-${String(tick).padStart(6, "0")}.jpg`;
        frames.push({ file: filename, progress });
      }
    }

    return { frames };
  } finally {
    // No interval to clean up since it's synchronous frame-by-frame
  }
}
