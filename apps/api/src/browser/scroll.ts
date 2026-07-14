import type { Page } from "playwright";
import type { FrameRecorder } from "../capture/frameRecorder.js";
import { resolveVirtualScrollSettings } from "../config/virtualScroll.js";
import type {
  AnimationConfig,
  MotionBeat,
  MotionTarget,
  PauseTrigger,
  ResolvedMotionBeat,
  ResolvedMotionPlan,
  ScrollCurve,
  ScrollMode,
} from "../types.js";
import type { BezierControlPoints } from "./curves.js";
import { resolveScrollCurve } from "./curves.js";
import { detectScrollMode } from "./detectScrollMode.js";
import { buildMotionTimeline, type TimelineBeat } from "./motion.js";
import { runVirtualTimeline } from "./virtualScroll.js";

const DEFAULT_BEAT_CURVE: ScrollCurve = { preset: "ease-in-out-cubic" };

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

export interface RunScrollResult {
  scrollStrategy: "document" | "virtual";
  maxScroll: number;
  frames?: Array<{ file: string; y?: number; progress?: number }>;
  motionPlan: ResolvedMotionPlan;
}

export async function runScroll(
  page: Page,
  options: RunScrollOptions,
): Promise<RunScrollResult> {
  const mode = await detectScrollMode(page, options.scrollMode ?? "auto");
  await settleCaptureAtTop(page);

  if (mode === "virtual") {
    return runDirectedVirtualScroll(page, options);
  }
  return runDirectedDocumentScroll(page, options);
}

async function runDirectedDocumentScroll(
  page: Page,
  options: RunScrollOptions,
): Promise<RunScrollResult> {
  const maxScroll = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  );
  const resolved = options.animationConfig?.direction
    ? await resolveDirectedDocumentBeats(
        page,
        options.animationConfig.direction.beats,
        maxScroll,
        options.viewportHeight,
      )
    : await resolveLegacyDocumentBeats(page, options, maxScroll);
  const startHoldMs = options.animationConfig?.direction?.startHoldMs
    ?? options.animationConfig?.heroHoldMs
    ?? 0;
  const fps = options.frameRecorder?.getFps() ?? 30;
  const samples = buildMotionTimeline({
    fps,
    startHoldMs,
    beats: resolved.timeline,
  });
  const frames: Array<{ file: string; y: number }> = [];
  let lastY = -1;

  for (const sample of samples) {
    const y = Math.max(0, Math.min(maxScroll, Math.round(sample.position)));
    if (y !== lastY) {
      await settleScrollPaint(page, y);
      lastY = y;
    }
    if (options.frameRecorder) {
      const frameNumber = options.frameRecorder.getFrameCount();
      await options.frameRecorder.writeFrame(page);
      frames.push({
        file: `frame-${String(frameNumber).padStart(6, "0")}.jpg`,
        y,
      });
    } else {
      await page.waitForTimeout(1000 / fps);
    }
  }

  const durationMs = Math.round((samples.length / fps) * 1000);
  return {
    scrollStrategy: "document",
    maxScroll,
    frames: options.frameRecorder ? frames : undefined,
    motionPlan: {
      mode: "document",
      startHoldMs,
      durationMs,
      beats: resolved.beats,
    },
  };
}

async function runDirectedVirtualScroll(
  page: Page,
  options: RunScrollOptions,
): Promise<RunScrollResult> {
  const virtual = resolveVirtualScrollSettings(
    options.animationConfig ?? {},
    options.viewportHeight,
    options.pixelsPerFrame,
    options.fastMode ?? false,
  );
  const direction = options.animationConfig?.direction;
  if (!direction && (options.pauseTriggers?.length ?? 0) > 0) {
    throw new Error(
      "Selector pause triggers are not supported on virtual-scroll pages. Inspect the page and use direction beats with progress targets.",
    );
  }

  const resolved = direction
    ? resolveDirectedVirtualBeats(direction.beats)
    : resolveLegacyVirtualBeats(virtual.durationMs, options.bezier);
  const startHoldMs = direction?.startHoldMs
    ?? options.animationConfig?.heroHoldMs
    ?? 0;
  const fps = options.frameRecorder?.getFps() ?? 30;
  const samples = buildMotionTimeline({
    fps,
    startHoldMs,
    beats: resolved.timeline,
  });
  const frames = await runVirtualTimeline(page, {
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    wheelBudget: virtual.wheelBudget,
    samples,
    frameRecorder: options.frameRecorder,
  });
  const durationMs = Math.round((samples.length / fps) * 1000);

  return {
    scrollStrategy: "virtual",
    maxScroll: 0,
    frames: options.frameRecorder ? frames : undefined,
    motionPlan: {
      mode: "virtual",
      startHoldMs,
      durationMs,
      beats: resolved.beats,
    },
  };
}

async function resolveDirectedDocumentBeats(
  page: Page,
  beats: MotionBeat[],
  maxScroll: number,
  viewportHeight: number,
) {
  if (beats.length === 0) throw new Error("direction.beats must contain at least one beat");
  let previous = 0;
  const resolved: ResolvedMotionBeat[] = [];
  const timeline: TimelineBeat[] = [];

  for (const beat of beats) {
    validateBeat(beat);
    const position = await resolveDocumentTarget(
      page,
      beat.target,
      maxScroll,
      viewportHeight,
    );
    if (position + 1 < previous) {
      throw new Error(`Direction target ${describeTarget(beat.target)} resolves behind the previous beat`);
    }
    previous = position;
    const curve = beat.curve ?? DEFAULT_BEAT_CURVE;
    resolved.push({
      target: beat.target,
      position,
      transitionMs: beat.transitionMs,
      holdMs: beat.holdMs ?? 0,
      curve,
    });
    timeline.push({
      position,
      transitionMs: beat.transitionMs,
      holdMs: beat.holdMs ?? 0,
      bezier: resolveScrollCurve(curve),
    });
  }
  return { beats: resolved, timeline };
}

function resolveDirectedVirtualBeats(beats: MotionBeat[]) {
  if (beats.length === 0) throw new Error("direction.beats must contain at least one beat");
  let previous = 0;
  const resolved: ResolvedMotionBeat[] = [];
  const timeline: TimelineBeat[] = [];
  for (const beat of beats) {
    validateBeat(beat);
    if (beat.target.type === "selector") {
      throw new Error(
        `Selector target ${beat.target.selector} cannot direct a virtual-scroll page; use a progress target from inspect_website`,
      );
    }
    const position = beat.target.type === "page-end" ? 1 : beat.target.value;
    if (position < 0 || position > 1) throw new Error("Virtual progress targets must be between 0 and 1");
    if (position + 1e-6 < previous) throw new Error("Virtual progress beats must be ordered from 0 to 1");
    previous = position;
    const curve = beat.curve ?? DEFAULT_BEAT_CURVE;
    resolved.push({ target: beat.target, position, transitionMs: beat.transitionMs, holdMs: beat.holdMs ?? 0, curve });
    timeline.push({ position, transitionMs: beat.transitionMs, holdMs: beat.holdMs ?? 0, bezier: resolveScrollCurve(curve) });
  }
  return { beats: resolved, timeline };
}

async function resolveLegacyDocumentBeats(
  page: Page,
  options: RunScrollOptions,
  maxScroll: number,
) {
  const pauses = normalizePauseTriggers(options.pauseTriggers ?? []);
  const pauseTargets: Array<{ target: MotionTarget; position: number; holdMs: number }> = [];
  for (const pause of pauses) {
    const target: MotionTarget = { type: "selector", selector: pause.selector, align: "center" };
    const position = await resolveDocumentTarget(page, target, maxScroll, options.viewportHeight);
    pauseTargets.push({ target, position, holdMs: pause.durationMs });
  }
  pauseTargets.sort((a, b) => a.position - b.position);
  const targets = [
    ...pauseTargets,
    { target: { type: "page-end" } as MotionTarget, position: maxScroll, holdMs: 0 },
  ].filter((target, index, all) => index === 0 || target.position > all[index - 1].position + 1 || target.holdMs > 0);
  const defaultMovementMs = Math.max(1000, (Math.ceil(maxScroll / Math.max(1, options.pixelsPerFrame)) / (options.frameRecorder?.getFps() ?? 30)) * 1000);
  const movementMs = options.animationConfig?.durationMs ?? defaultMovementMs;
  const curve: ScrollCurve = options.animationConfig?.scrollCurve ?? { preset: "linear" };
  const resolved: ResolvedMotionBeat[] = [];
  const timeline: TimelineBeat[] = [];
  let previous = 0;
  for (const target of targets) {
    const distance = Math.max(0, target.position - previous);
    const transitionMs = maxScroll > 0 ? Math.max(1, Math.round(movementMs * distance / maxScroll)) : 1;
    resolved.push({ target: target.target, position: target.position, transitionMs, holdMs: target.holdMs, curve });
    timeline.push({ position: target.position, transitionMs, holdMs: target.holdMs, bezier: options.bezier });
    previous = target.position;
  }
  return { beats: resolved, timeline };
}

function resolveLegacyVirtualBeats(durationMs: number, bezier: BezierControlPoints) {
  const target: MotionTarget = { type: "page-end" };
  return {
    beats: [{ target, position: 1, transitionMs: durationMs, holdMs: 0, curve: { preset: "linear" } } satisfies ResolvedMotionBeat],
    timeline: [{ position: 1, transitionMs: durationMs, holdMs: 0, bezier }],
  };
}

async function resolveDocumentTarget(
  page: Page,
  target: MotionTarget,
  maxScroll: number,
  viewportHeight: number,
) {
  if (target.type === "page-end") return maxScroll;
  if (target.type === "progress") {
    if (target.value < 0 || target.value > 1) throw new Error("Progress targets must be between 0 and 1");
    return maxScroll * target.value;
  }
  const metrics = await page.evaluate((selector) => {
    let element: Element | null = null;
    try { element = document.querySelector(selector); } catch { return null; }
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { top: rect.top + window.scrollY, height: rect.height };
  }, target.selector);
  if (!metrics) throw new Error(`Direction selector was not found or visible: ${target.selector}`);
  const align = target.align ?? "center";
  const base = align === "top"
    ? metrics.top
    : align === "bottom"
      ? metrics.top + metrics.height - viewportHeight
      : metrics.top + metrics.height / 2 - viewportHeight / 2;
  return Math.max(0, Math.min(maxScroll, base + (target.offsetPx ?? 0)));
}

function validateBeat(beat: MotionBeat) {
  if (!Number.isFinite(beat.transitionMs) || beat.transitionMs < 250 || beat.transitionMs > 60_000) {
    throw new Error("Each direction transitionMs must be between 250 and 60000");
  }
  const holdMs = beat.holdMs ?? 0;
  if (!Number.isFinite(holdMs) || holdMs < 0 || holdMs > 15_000) {
    throw new Error("Each direction holdMs must be between 0 and 15000");
  }
  resolveScrollCurve(beat.curve ?? DEFAULT_BEAT_CURVE);
}

function normalizePauseTriggers(triggers: PauseTrigger[]) {
  return triggers
    .map((trigger) => ({ selector: trigger.selector.trim(), durationMs: Math.max(0, Math.round(trigger.durationMs)) }))
    .filter((trigger) => trigger.selector.length > 0 && trigger.durationMs >= 100);
}

function describeTarget(target: MotionTarget) {
  if (target.type === "selector") return target.selector;
  if (target.type === "progress") return `progress ${target.value}`;
  return "page end";
}

async function settleScrollPaint(page: Page, scrollY: number) {
  await page.evaluate(async (y) => {
    window.scrollTo({ top: y, left: 0, behavior: "instant" });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }, scrollY);
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
