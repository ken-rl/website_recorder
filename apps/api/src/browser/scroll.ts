import type { Page } from "playwright";
import type { BezierControlPoints } from "./curves.js";
import { detectScrollMode } from "./detectScrollMode.js";
import { runVirtualScroll } from "./virtualScroll.js";
import { resolveVirtualScrollSettings } from "../config/virtualScroll.js";
import type { AnimationConfig, ScrollMode } from "../types.js";
import type { PauseTrigger } from "../types.js";
import type { FrameRecorder } from "../capture/frameRecorder.js";

const SCROLL_REFERENCE_FPS = 60;

export interface RunScrollOptions {
  pixelsPerFrame: number;
  pauseTriggers: PauseTrigger[];
  bezier: BezierControlPoints;
  scrollMode?: ScrollMode;
  animationConfig?: AnimationConfig;
  viewportWidth: number;
  viewportHeight: number;
  fastMode?: boolean;
  frameRecorder?: FrameRecorder;
}

export async function runScroll(page: Page, options: RunScrollOptions): Promise<{
  scrollStrategy: "document" | "virtual";
  maxScroll: number;
  frames?: Array<{ file: string; y?: number; progress?: number }>;
}> {
  const mode = await detectScrollMode(page, options.scrollMode ?? "auto");

  if (mode === "virtual") {
    const virtual = resolveVirtualScrollSettings(
      options.animationConfig ?? {},
      options.viewportHeight,
      options.pixelsPerFrame,
      options.fastMode ?? false,
    );

    console.log(
      `Virtual scroll mode: ${virtual.cycles} viewport cycles over ${Math.round(virtual.durationMs)}ms`,
    );

    const result = await runVirtualScroll(page, {
      durationMs: virtual.durationMs,
      viewportWidth: options.viewportWidth,
      viewportHeight: options.viewportHeight,
      wheelBudget: virtual.wheelBudget,
      bezier: options.bezier,
      frameRecorder: options.frameRecorder,
    });
    return { scrollStrategy: mode, maxScroll: 0, frames: result.frames };
  }

  const result = await runDocumentScroll(
    page,
    options.pixelsPerFrame,
    options.frameRecorder,
  );
  return { scrollStrategy: mode, maxScroll: result.maxScroll, frames: result.frames };
}

async function runDocumentScroll(
  page: Page,
  pixelsPerFrame: number,
  frameRecorder?: FrameRecorder,
): Promise<{ maxScroll: number; frames?: Array<{ file: string; y: number }> }> {
  // When a frameRecorder is attached (export mode), drive scrolling frame-by-frame
  // from Node.js so we can take a screenshot after each step.
  if (frameRecorder) {
    return runDocumentScrollFrameByFrame(page, pixelsPerFrame, frameRecorder);
  }

  // Preview mode (no recorder): hand off the full animation to the browser for speed.
  await page.evaluate(
    async ({ pixelsPerFrame }) => {
      await new Promise<void>((resolve) => {
        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );

        if (maxScroll === 0) {
          resolve();
          return;
        }

        // Just scroll instantly to the bottom for preview mode to determine scroll height
        window.scrollTo({ top: maxScroll, left: 0, behavior: "instant" });
        resolve();
      });
    },
    {
      pixelsPerFrame,
    },
  );
  const maxScroll = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  );
  return { maxScroll };
}

/**
 * Node.js-driven linear frame-by-frame scroll for export mode.
 * Steps one frame at a time, takes a screenshot after each step,
 * returning metadata mapping each frame to its scroll position.
 */
async function runDocumentScrollFrameByFrame(
  page: Page,
  pixelsPerFrame: number,
  frameRecorder: FrameRecorder,
): Promise<{ maxScroll: number; frames: Array<{ file: string; y: number }> }> {
  const maxScroll: number = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  );

  const frames: Array<{ file: string; y: number }> = [];

  if (maxScroll === 0) {
    await frameRecorder.writeFrame(page);
    frames.push({ file: "frame-000000.jpg", y: 0 });
    return { maxScroll: 0, frames };
  }

  const totalFrames = Math.max(1, Math.ceil(maxScroll / pixelsPerFrame));

  for (let frame = 0; frame <= totalFrames; frame++) {
    const progress = frame / totalFrames;
    const scrollY = Math.round(maxScroll * progress);

    await page.evaluate((y) => window.scrollTo({ top: y, left: 0, behavior: "instant" }), scrollY);
    await frameRecorder.writeFrame(page);

    const filename = `frame-${String(frame).padStart(6, "0")}.jpg`;
    frames.push({ file: filename, y: scrollY });
  }

  return { maxScroll, frames };
}
