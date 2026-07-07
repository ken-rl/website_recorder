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
) {
  const { durationMs, viewportWidth, viewportHeight, wheelBudget, bezier, frameRecorder } =
    options;
  const centerX = Math.floor(viewportWidth / 2);
  const centerY = Math.floor(viewportHeight / 2);
  const tickMs = 1000 / WHEEL_TICK_HZ;
  const tickCount = Math.max(1, Math.ceil(durationMs / tickMs));

  // If frame recording, start capturing frames in parallel
  let captureInterval: NodeJS.Timeout | null = null;
  if (frameRecorder) {
    const frameDurationMs = 1000 / frameRecorder.getFps();
    captureInterval = setInterval(async () => {
      try {
        await frameRecorder.writeFrame(page);
      } catch (e) {
        // Ignore frame capture errors
      }
    }, frameDurationMs);
  }

  try {
    await page.mouse.move(centerX, centerY);
    await page.mouse.click(centerX, centerY);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: centerX,
      y: centerY,
    });

    const startedAt = performance.now();
    let lastEasedProgress = 0;
    let wheelCarry = 0;

    for (let tick = 1; tick <= tickCount; tick += 1) {
      const elapsedMs = Math.min(durationMs, tick * tickMs);
      const linearProgress = elapsedMs / durationMs;
      const easedProgress = applyScrollCurve(linearProgress, bezier);
      const progressDelta = easedProgress - lastEasedProgress;
      lastEasedProgress = easedProgress;

      wheelCarry += progressDelta * wheelBudget;
      const wheelDelta = Math.floor(wheelCarry);
      wheelCarry -= wheelDelta;

      if (wheelDelta > 0) {
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: centerX,
          y: centerY,
          deltaX: 0,
          deltaY: wheelDelta,
        });
      }

      await waitUntil(startedAt + tick * tickMs);
    }

    await sleep(150);
  } finally {
    if (captureInterval) {
      clearInterval(captureInterval);
    }
  }
}
