import type { Page } from "playwright";
import type { FrameRecorder } from "../capture/frameRecorder.js";
import type { MotionSample } from "./motion.js";

export interface VirtualTimelineOptions {
  viewportWidth: number;
  viewportHeight: number;
  wheelBudget: number;
  samples: MotionSample[];
  frameRecorder?: FrameRecorder;
  signal?: AbortSignal;
  onProgress?: (completedFrames: number, totalFrames: number) => void | Promise<void>;
}

/** Drives virtual-scroll pages by cumulative progress, preserving fractional wheel deltas. */
export async function runVirtualTimeline(
  page: Page,
  options: VirtualTimelineOptions,
): Promise<Array<{ file: string; progress: number }>> {
  const centerX = Math.floor(options.viewportWidth / 2);
  const centerY = Math.floor(options.viewportHeight / 2);
  const frames: Array<{ file: string; progress: number }> = [];
  const cdp = await page.context().newCDPSession(page);

  await page.mouse.move(centerX, centerY);
  await page.mouse.click(centerX, centerY);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: centerX,
    y: centerY,
  });

  for (const [index, sample] of options.samples.entries()) {
    options.signal?.throwIfAborted();
    const deltaY = virtualWheelDelta(options.samples, index, options.wheelBudget);
    if (Math.abs(deltaY) > 1e-6) {
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: centerX,
        y: centerY,
        deltaX: 0,
        deltaY,
      });
    }

    await settleVirtualPaint(page);
    if (options.frameRecorder) {
      const frameNumber = options.frameRecorder.getFrameCount();
      await options.frameRecorder.writeFrame(page);
      frames.push({
        file: `frame-${String(frameNumber).padStart(6, "0")}.jpg`,
        progress: sample.position,
      });
    } else {
      await page.waitForTimeout(1000 / 30);
    }
    await options.onProgress?.(index + 1, options.samples.length);
  }

  await cdp.detach().catch(() => undefined);
  return frames;
}

export function virtualWheelDelta(
  samples: MotionSample[],
  index: number,
  wheelBudget: number,
) {
  const previous = index === 0 ? 0 : samples[index - 1].position * wheelBudget;
  return samples[index].position * wheelBudget - previous;
}

async function settleVirtualPaint(page: Page) {
  await page.evaluate(() =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ),
  );
}
