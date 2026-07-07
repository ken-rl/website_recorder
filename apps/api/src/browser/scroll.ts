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

export async function runScroll(page: Page, options: RunScrollOptions) {
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

    await runVirtualScroll(page, {
      durationMs: virtual.durationMs,
      viewportWidth: options.viewportWidth,
      viewportHeight: options.viewportHeight,
      wheelBudget: virtual.wheelBudget,
      bezier: options.bezier,
      frameRecorder: options.frameRecorder,
    });
    return mode;
  }

  await runDocumentScroll(
    page,
    options.pixelsPerFrame,
    options.pauseTriggers,
    options.bezier,
    options.frameRecorder,
  );
  return mode;
}

async function runDocumentScroll(
  page: Page,
  pixelsPerFrame: number,
  pauseTriggers: PauseTrigger[],
  bezier: BezierControlPoints,
  frameRecorder?: FrameRecorder,
) {
  // When a frameRecorder is attached (export mode), drive scrolling frame-by-frame
  // from Node.js so we can take a screenshot after each step.
  // The page.evaluate() approach blocks the Node.js thread, making setInterval
  // unable to capture frames during the animation.
  if (frameRecorder) {
    await runDocumentScrollFrameByFrame(page, pixelsPerFrame, pauseTriggers, bezier, frameRecorder);
    return;
  }

  // Preview mode (no recorder): hand off the full animation to the browser for speed.
  await page.evaluate(
    async ({ pixelsPerFrame, pauseTriggers, bezier, scrollReferenceFps }) => {
      await new Promise<void>((resolve) => {
        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );

        if (maxScroll === 0) {
          resolve();
          return;
        }

        const totalFrames = Math.max(1, maxScroll / pixelsPerFrame);
        const durationMs = totalFrames * (1000 / scrollReferenceFps);
        const detectedTargets = new Set<string>();

        let startTime = 0;
        let pausedMs = 0;
        let pauseStartedAt = 0;

        function elapsedMs(now: number) {
          return now - startTime - pausedMs;
        }

        function applyCurve(linearProgress: number) {
          const [x1, y1, x2, y2] = bezier;
          if (linearProgress <= 0) return 0;
          if (linearProgress >= 1) return 1;

          function sampleX(t: number) {
            const inv = 1 - t;
            return 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t;
          }

          function sampleY(t: number) {
            const inv = 1 - t;
            return 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t;
          }

          function sampleDx(t: number) {
            return (
              3 * (1 - t) * (1 - t) * x1 +
              6 * (1 - t) * t * (x2 - x1) +
              3 * t * t * (1 - x2)
            );
          }

          let start = 0;
          let end = 1;
          let param = linearProgress;

          for (let i = 0; i < 8; i += 1) {
            param = (start + end) / 2;
            const x = sampleX(param);
            if (x < linearProgress) start = param;
            else end = param;
          }

          param = (start + end) / 2;
          const dx = sampleDx(param);
          if (Math.abs(dx) > 1e-6) {
            param -= (sampleX(param) - linearProgress) / dx;
          }

          return sampleY(Math.min(1, Math.max(0, param)));
        }

        function step(now: number) {
          if (!startTime) startTime = now;

          for (const trigger of pauseTriggers) {
            const element = document.querySelector(trigger.selector);
            if (element && !detectedTargets.has(trigger.selector)) {
              const rect = element.getBoundingClientRect();
              if (rect.top <= window.innerHeight / 2 && rect.bottom >= 0) {
                detectedTargets.add(trigger.selector);
                pauseStartedAt = performance.now();
                setTimeout(() => {
                  pausedMs += performance.now() - pauseStartedAt;
                  requestAnimationFrame(step);
                }, trigger.durationMs);
                return;
              }
            }
          }

          const linearProgress = Math.min(1, elapsedMs(now) / durationMs);
          const easedProgress = applyCurve(linearProgress);
          const scrollY = maxScroll * easedProgress;

          window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });

          if (linearProgress < 1) requestAnimationFrame(step);
          else resolve();
        }

        requestAnimationFrame(step);
      });
    },
    {
      pixelsPerFrame,
      pauseTriggers,
      bezier,
      scrollReferenceFps: SCROLL_REFERENCE_FPS,
    },
  );
}

/**
 * Node.js-driven frame-by-frame scroll for export mode.
 * Steps one frame at a time, takes a screenshot after each step,
 * guaranteeing exactly (maxScroll / pixelsPerFrame) frames at the target FPS.
 */
async function runDocumentScrollFrameByFrame(
  page: Page,
  pixelsPerFrame: number,
  pauseTriggers: PauseTrigger[],
  bezier: BezierControlPoints,
  frameRecorder: FrameRecorder,
) {
  const maxScroll: number = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  );

  if (maxScroll === 0) {
    // Still capture at least one frame for empty pages
    await frameRecorder.writeFrame(page);
    return;
  }

  const totalFrames = Math.max(1, Math.ceil(maxScroll / pixelsPerFrame));

  function applyBezierCurve(
    linearProgress: number,
    bezier: BezierControlPoints,
  ): number {
    const [x1, y1, x2, y2] = bezier;
    if (linearProgress <= 0) return 0;
    if (linearProgress >= 1) return 1;

    const sampleX = (t: number) => {
      const inv = 1 - t;
      return 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t;
    };
    const sampleY = (t: number) => {
      const inv = 1 - t;
      return 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t;
    };
    const sampleDx = (t: number) =>
      3 * (1 - t) * (1 - t) * x1 +
      6 * (1 - t) * t * (x2 - x1) +
      3 * t * t * (1 - x2);

    let start = 0;
    let end = 1;
    let param = linearProgress;
    for (let i = 0; i < 8; i++) {
      param = (start + end) / 2;
      if (sampleX(param) < linearProgress) start = param;
      else end = param;
    }
    param = (start + end) / 2;
    const dx = sampleDx(param);
    if (Math.abs(dx) > 1e-6) param -= (sampleX(param) - linearProgress) / dx;
    return sampleY(Math.min(1, Math.max(0, param)));
  }

  const detectedTargets = new Set<string>();

  for (let frame = 0; frame <= totalFrames; frame++) {
    const linearProgress = frame / totalFrames;
    const easedProgress = applyBezierCurve(linearProgress, bezier);
    const scrollY = Math.round(maxScroll * easedProgress);

    await page.evaluate((y) => window.scrollTo({ top: y, left: 0, behavior: "instant" }), scrollY);

    // Check pause triggers
    for (const trigger of pauseTriggers) {
      if (detectedTargets.has(trigger.selector)) continue;
      const inView: boolean = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top <= window.innerHeight / 2 && r.bottom >= 0;
      }, trigger.selector);
      if (inView) {
        detectedTargets.add(trigger.selector);
        // Capture hold frames for the pause duration
        const holdFrames = Math.round((trigger.durationMs / 1000) * frameRecorder.getFps());
        for (let h = 0; h < holdFrames; h++) {
          await frameRecorder.writeFrame(page);
        }
      }
    }

    await frameRecorder.writeFrame(page);
  }
}
