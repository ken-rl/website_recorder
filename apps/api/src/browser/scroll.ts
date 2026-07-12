import type { Page } from "playwright";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import type { BezierControlPoints } from "./curves.js";
import { detectScrollMode } from "./detectScrollMode.js";
import { runVirtualScroll } from "./virtualScroll.js";
import { resolveVirtualScrollSettings } from "../config/virtualScroll.js";
import type { AnimationConfig, ScrollMode } from "../types.js";
import type { PauseTrigger } from "../types.js";
import type { FrameRecorder } from "../capture/frameRecorder.js";
import { applyScrollCurve } from "./scrollEasing.js";

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
  initialHoldFrameCount?: number;
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

    await settleCaptureAtTop(page);
    const hold = await captureHeroHold(
      page,
      options.frameRecorder,
      options.animationConfig?.heroHoldMs ?? 0,
    );
    const result = await runVirtualScroll(page, {
      durationMs: virtual.durationMs,
      viewportWidth: options.viewportWidth,
      viewportHeight: options.viewportHeight,
      wheelBudget: virtual.wheelBudget,
      bezier: options.bezier,
      frameRecorder: options.frameRecorder,
    });
    const frames = options.frameRecorder
      ? [...hold.frames, ...result.frames]
      : undefined;
    return {
      scrollStrategy: mode,
      maxScroll: 0,
      frames,
      initialHoldFrameCount: frames ? hold.frames.length : undefined,
    };
  }

  await settleCaptureAtTop(page);
  const hold = await captureHeroHold(
    page,
    options.frameRecorder,
    options.animationConfig?.heroHoldMs ?? 0,
  );

  const result = await runDocumentScroll(
    page,
    options.pixelsPerFrame,
    options.bezier,
    options.pauseTriggers ?? [],
    options.frameRecorder,
  );
  const frames = options.frameRecorder
    ? [...hold.frames, ...(result.frames ?? [])]
    : undefined;
  return {
    scrollStrategy: mode,
    maxScroll: result.maxScroll,
    frames,
    initialHoldFrameCount: frames ? hold.frames.length : undefined,
  };
}

function normalizePauseTriggers(triggers: PauseTrigger[]): PauseTrigger[] {
  return triggers
    .map((t) => ({
      selector: (t.selector ?? "").trim(),
      durationMs: Math.max(0, Math.round(Number(t.durationMs) || 0)),
    }))
    .filter((t) => t.selector.length > 0 && t.durationMs >= 100);
}

/** True when the first matching element intersects the viewport. */
async function isSelectorInViewport(page: Page, selector: string): Promise<boolean> {
  try {
    return await page.evaluate((sel) => {
      let el: Element | null = null;
      try {
        el = document.querySelector(sel);
      } catch {
        return false;
      }
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const vw = window.innerWidth || document.documentElement.clientWidth;
      // Visible if any part intersects the viewport (with a small top/bottom inset
      // so sticky headers don't immediately fire every trigger).
      const topInset = Math.min(80, vh * 0.08);
      const bottomInset = Math.min(40, vh * 0.04);
      return (
        rect.bottom > topInset &&
        rect.top < vh - bottomInset &&
        rect.right > 0 &&
        rect.left < vw
      );
    }, selector);
  } catch {
    return false;
  }
}

async function settleScrollPaint(page: Page, scrollY: number) {
  await page.evaluate(async (y) => {
    window.scrollTo({ top: y, left: 0, behavior: "instant" });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }, scrollY);
}

/**
 * Hold at the current scroll position for durationMs (document scroll only).
 * With a frame recorder, writes repeated still frames; otherwise sleeps.
 */
async function holdAtScrollPosition(
  page: Page,
  scrollY: number,
  durationMs: number,
  frameRecorder: FrameRecorder | undefined,
  frames: Array<{ file: string; y: number }>,
) {
  if (durationMs < 100) return;

  if (!frameRecorder) {
    await page.waitForTimeout(durationMs);
    return;
  }

  const fps = frameRecorder.getFps();
  const frameDurationMs = 1000 / fps;
  const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps));
  const startedAt = performance.now();

  for (let i = 0; i < frameCount; i += 1) {
    const frameNumber = frameRecorder.getFrameCount();
    await frameRecorder.writeFrame(page);
    frames.push({
      file: `frame-${String(frameNumber).padStart(6, "0")}.jpg`,
      y: scrollY,
    });
    await waitForCadence(startedAt + (i + 1) * frameDurationMs);
  }
}

async function runDocumentScroll(
  page: Page,
  pixelsPerFrame: number,
  bezier: BezierControlPoints,
  pauseTriggers: PauseTrigger[],
  frameRecorder?: FrameRecorder,
): Promise<{ maxScroll: number; frames?: Array<{ file: string; y: number }> }> {
  // When a frameRecorder is attached (export mode), drive scrolling frame-by-frame
  // from Node.js so we can take a screenshot after each step.
  if (frameRecorder) {
    return runDocumentScrollFrameByFrame(
      page,
      pixelsPerFrame,
      bezier,
      pauseTriggers,
      frameRecorder,
    );
  }

  // Preview mode (no recorder): drive the scroll frame-by-frame from Node.js
  // with a small delay to let the browser's main thread layout and render scroll animations.
  const maxScroll: number = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  );

  if (maxScroll === 0) {
    return { maxScroll: 0 };
  }

  const triggers = normalizePauseTriggers(pauseTriggers);
  const fired = new Set<number>();
  const totalFrames = Math.max(1, Math.ceil(maxScroll / pixelsPerFrame));

  for (let frame = 0; frame <= totalFrames; frame++) {
    const progress = frame / totalFrames;
    const easedProgress = applyScrollCurve(progress, bezier);
    const scrollY = Math.round(maxScroll * easedProgress);

    await page.evaluate((y) => window.scrollTo({ top: y, left: 0, behavior: "instant" }), scrollY);
    // 33ms wait roughly corresponds to ~30fps playback tick rate, giving the page's JS
    // (GSAP / WebGL loops) time to process the scroll event and redraw.
    await page.waitForTimeout(33);

    for (let i = 0; i < triggers.length; i += 1) {
      if (fired.has(i)) continue;
      if (await isSelectorInViewport(page, triggers[i].selector)) {
        fired.add(i);
        console.log(
          `Pause trigger fired: ${triggers[i].selector} @ y=${scrollY} for ${triggers[i].durationMs}ms`,
        );
        await holdAtScrollPosition(
          page,
          scrollY,
          triggers[i].durationMs,
          undefined,
          [],
        );
      }
    }
  }

  return { maxScroll };
}

/**
 * Node.js-driven frame-by-frame scroll for export mode.
 * Applies the same easing curve as preview, settles paint with double-rAF
 * before each screenshot, and steps one frame at a time.
 * Fires each pause trigger once when its selector first enters the viewport.
 */
async function runDocumentScrollFrameByFrame(
  page: Page,
  pixelsPerFrame: number,
  bezier: BezierControlPoints,
  pauseTriggers: PauseTrigger[],
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

  const triggers = normalizePauseTriggers(pauseTriggers);
  const fired = new Set<number>();
  const totalFrames = Math.max(1, Math.ceil(maxScroll / pixelsPerFrame));
  const frameDurationMs = 1000 / frameRecorder.getFps();
  let lastY = -1;
  // Cadence restarts after holds so inserted pause frames don't desync later timing.
  let cadenceOrigin = performance.now();
  let cadenceIndex = 0;

  for (let frame = 0; frame <= totalFrames; frame++) {
    const progress = frame / totalFrames;
    const easedProgress = applyScrollCurve(progress, bezier);
    // Floor keeps per-frame deltas monotonic and avoids 1px round-trip jitter.
    const scrollY = Math.min(
      maxScroll,
      Math.floor(maxScroll * easedProgress + 1e-6),
    );

    if (scrollY !== lastY) {
      await settleScrollPaint(page, scrollY);
      lastY = scrollY;
    }

    const frameNumber = frameRecorder.getFrameCount();
    await frameRecorder.writeFrame(page);

    const filename = `frame-${String(frameNumber).padStart(6, "0")}.jpg`;
    frames.push({ file: filename, y: scrollY });
    cadenceIndex += 1;
    await waitForCadence(cadenceOrigin + cadenceIndex * frameDurationMs);

    for (let i = 0; i < triggers.length; i += 1) {
      if (fired.has(i)) continue;
      if (await isSelectorInViewport(page, triggers[i].selector)) {
        fired.add(i);
        console.log(
          `Pause trigger fired: ${triggers[i].selector} @ y=${scrollY} for ${triggers[i].durationMs}ms`,
        );
        await holdAtScrollPosition(
          page,
          scrollY,
          triggers[i].durationMs,
          frameRecorder,
          frames,
        );
        // Reset cadence after the hold so remaining scroll frames stay on tempo.
        cadenceOrigin = performance.now();
        cadenceIndex = 0;
      }
    }
  }

  return { maxScroll, frames };
}

async function settleCaptureAtTop(page: Page) {
  await page.evaluate(async () => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.waitForTimeout(250);
}

async function captureHeroHold(
  page: Page,
  frameRecorder: FrameRecorder | undefined,
  holdMs: number,
) {
  const frames: Array<{ file: string; y: number }> = [];
  if (!frameRecorder || holdMs <= 0) return { frames };

  const fps = frameRecorder.getFps();
  const frameDurationMs = 1000 / fps;
  const frameCount = Math.max(1, Math.round((holdMs / 1000) * fps));
  const startedAt = performance.now();

  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameNumber = frameRecorder.getFrameCount();
    await frameRecorder.writeFrame(page);
    frames.push({
      file: `frame-${String(frameNumber).padStart(6, "0")}.jpg`,
      y: 0,
    });
    await waitForCadence(startedAt + (frame + 1) * frameDurationMs);
  }

  return { frames };
}

async function waitForCadence(deadlineMs: number) {
  const delayMs = deadlineMs - performance.now();
  if (delayMs > 0) await sleep(delayMs);
}
