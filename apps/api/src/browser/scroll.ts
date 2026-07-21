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
import { DEFAULT_DIRECTED_START_HOLD_MS } from "../types.js";
import type { BezierControlPoints } from "./curves.js";
import { resolveScrollCurve } from "./curves.js";
import { detectScrollMode } from "./detectScrollMode.js";
import { buildMotionTimeline, type TimelineBeat } from "./motion.js";
import { runVirtualTimeline } from "./virtualScroll.js";
import {
  alignedDocumentPosition,
  collectSemanticAnchors,
  detectSafeViewport,
  type SafeViewport,
  type SemanticAnchor,
  nearestSemanticAnchor,
  resolvePauseFraming,
} from "./composition.js";
import { normalizeResolvedBeats } from "./directionGuardrails.js";
import { ComponentInteractionAnimator } from "./componentInteraction.js";

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
  signal?: AbortSignal;
  onProgress?: (completedFrames: number, totalFrames: number) => void | Promise<void>;
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
  const direction = options.animationConfig?.direction;
  const startHoldMs = direction
    ? direction.startHoldMs ?? DEFAULT_DIRECTED_START_HOLD_MS
    : options.animationConfig?.heroHoldMs ?? 0;
  const safeViewport = await detectSafeViewport(
    page,
    options.viewportWidth,
    options.viewportHeight,
  );
  const anchors = direction
    ? await collectSemanticAnchors(page, safeViewport, options.viewportHeight, maxScroll)
    : [];
  const resolved = direction
    ? await resolveDirectedDocumentBeats(
        page,
        direction.beats,
        maxScroll,
        options.viewportHeight,
        safeViewport,
        anchors,
        startHoldMs,
      )
    : await resolveLegacyDocumentBeats(page, options, maxScroll, safeViewport);
  const fps = options.frameRecorder?.getFps() ?? 30;
  const samples = buildMotionTimeline({
    fps,
    startHoldMs,
    beats: resolved.timeline,
  });
  const frames: Array<{ file: string; y: number }> = [];
  let lastY = -1;
  const interactionAnimator = new ComponentInteractionAnimator(page);

  for (const [index, sample] of samples.entries()) {
    options.signal?.throwIfAborted();
    const y = Math.max(0, Math.min(maxScroll, Math.round(sample.position)));
    if (y !== lastY) {
      await settleScrollPaint(page, y);
      lastY = y;
    }
    const activeBeat = sample.beatIndex >= 0 ? resolved.beats[sample.beatIndex] : undefined;
    if (
      sample.phase === "hold"
      && activeBeat?.interaction
      && activeBeat.target.type === "selector"
    ) {
      await interactionAnimator.render({
        beatIndex: sample.beatIndex,
        selector: activeBeat.target.selector,
        interaction: activeBeat.interaction,
        progress: sample.phaseProgress ?? 0,
      });
    } else {
      await interactionAnimator.reset();
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
    await options.onProgress?.(index + 1, samples.length);
  }

  const durationMs = Math.round((samples.length / fps) * 1000);
  await interactionAnimator.reset();
  return {
    scrollStrategy: "document",
    maxScroll,
    frames: options.frameRecorder ? frames : undefined,
    motionPlan: {
      mode: "document",
      startHoldMs,
      durationMs,
      beats: resolved.beats,
      adjustments: resolved.adjustments,
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

  const startHoldMs = direction?.startHoldMs
    ?? (direction ? DEFAULT_DIRECTED_START_HOLD_MS : options.animationConfig?.heroHoldMs ?? 0);
  const resolved = direction
    ? resolveDirectedVirtualBeats(
        direction.beats,
        startHoldMs,
        options.viewportHeight,
        virtual.wheelBudget,
      )
    : resolveLegacyVirtualBeats(virtual.durationMs, options.bezier);
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
    signal: options.signal,
    onProgress: options.onProgress,
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
      adjustments: resolved.adjustments,
    },
  };
}

async function resolveDirectedDocumentBeats(
  page: Page,
  beats: MotionBeat[],
  maxScroll: number,
  viewportHeight: number,
  safeViewport: SafeViewport,
  anchors: SemanticAnchor[],
  startHoldMs: number,
) {
  if (beats.length === 0) throw new Error("direction.beats must contain at least one beat");
  const resolved: ResolvedMotionBeat[] = [];
  const adjustments: import("../types.js").MotionPlanAdjustment[] = [];

  for (const [beatIndex, beat] of beats.entries()) {
    validateBeat(beat);
    let target = beat.target;
    let position = await resolveDocumentTarget(
      page,
      target,
      maxScroll,
      viewportHeight,
      safeViewport,
    );
    if (target.type === "progress" && (beat.holdMs ?? 0) > 0) {
      const nearest = nearestSemanticAnchor(anchors, position, viewportHeight);
      if (nearest) {
        const requested = target;
        target = { type: "selector", selector: nearest.selector, align: nearest.recommendedAlign };
        position = nearest.position;
        adjustments.push({
          beatIndex,
          code: "promoted-progress-target",
          message: `Promoted a held progress target to the nearby “${nearest.label}” section`,
          requested,
          resolved: target,
        });
      }
    }
    const curve = beat.curve ?? DEFAULT_BEAT_CURVE;
    resolved.push({
      target,
      position,
      transitionMs: beat.transitionMs,
      holdMs: beat.holdMs ?? 0,
      curve,
      interaction: beat.interaction,
    });
  }
  await applyHeldBeatFraming(
    page,
    resolved,
    adjustments,
    safeViewport,
    viewportHeight,
    maxScroll,
  );
  const normalized = normalizeResolvedBeats({
    beats: resolved,
    startHoldMs,
    viewportHeight,
    adjustments,
  });
  normalized.beats.forEach((beat, index) => {
    if (index > 0 && beat.position + 1 < normalized.beats[index - 1].position) {
      throw new Error(`Direction target ${describeTarget(beat.target)} resolves behind the previous beat`);
    }
  });
  return {
    ...normalized,
    timeline: normalized.beats.map((beat) => ({
      position: beat.position,
      transitionMs: beat.transitionMs,
      holdMs: beat.holdMs,
      bezier: resolveScrollCurve(beat.curve),
    })),
  };
}

async function applyHeldBeatFraming(
  page: Page,
  beats: ResolvedMotionBeat[],
  adjustments: import("../types.js").MotionPlanAdjustment[],
  safeViewport: SafeViewport,
  viewportHeight: number,
  maxScroll: number,
) {
  for (const [beatIndex, beat] of beats.entries()) {
    if (beat.holdMs <= 0 || beat.target.type !== "selector") continue;
    const metrics = await page.evaluate((selector) => {
      let element: Element | null = null;
      try { element = document.querySelector(selector); } catch { return null; }
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        y: rect.top + window.scrollY,
        height: rect.height,
      };
    }, beat.target.selector);
    if (!metrics) continue;

    const align = beat.target.align ?? "center";
    const framing = resolvePauseFraming({
      y: metrics.y,
      height: metrics.height,
      position: beat.position,
      align,
      safeViewport,
      viewportHeight,
      maxScroll,
    });
    const requestedPosition = beat.position;
    beat.position = framing.targetY;
    beat.framing = {
      selector: beat.target.selector,
      align: framing.align,
      targetY: framing.targetY,
      safeTopPx: framing.safeTopPx,
      safeBottomPx: framing.safeBottomPx,
      verified: framing.verified,
    };
    if (Math.abs(requestedPosition - beat.position) > 1) {
      adjustments.push({
        beatIndex,
        code: "corrected-pause-framing",
        message: "Adjusted a held target to keep its focal element inside the safe viewport",
        requested: requestedPosition,
        resolved: beat.position,
      });
    }
  }
}

function resolveDirectedVirtualBeats(
  beats: MotionBeat[],
  startHoldMs: number,
  viewportHeight: number,
  wheelBudget: number,
) {
  if (beats.length === 0) throw new Error("direction.beats must contain at least one beat");
  let previous = 0;
  const resolved: ResolvedMotionBeat[] = [];
  for (const beat of beats) {
    validateBeat(beat);
    if (beat.interaction) {
      throw new Error("Component interactions are only supported on document-scroll pages");
    }
    if (beat.target.type === "selector") {
      if (beat.target.fallbackProgress === undefined) {
        throw new Error(
          `Selector target ${beat.target.selector} cannot direct a virtual-scroll page; use a progress target from inspect_website`,
        );
      }
    }
    const position = beat.target.type === "page-end"
      ? 1
      : beat.target.type === "selector"
        ? beat.target.fallbackProgress!
        : beat.target.value;
    if (position < 0 || position > 1) throw new Error("Virtual progress targets must be between 0 and 1");
    if (position + 1e-6 < previous) throw new Error("Virtual progress beats must be ordered from 0 to 1");
    previous = position;
    const curve = beat.curve ?? DEFAULT_BEAT_CURVE;
    resolved.push({ target: beat.target, position, transitionMs: beat.transitionMs, holdMs: beat.holdMs ?? 0, curve });
  }
  const normalized = normalizeResolvedBeats({
    beats: resolved,
    startHoldMs,
    viewportHeight,
    positionScale: wheelBudget,
  });
  return {
    ...normalized,
    timeline: normalized.beats.map((beat) => ({
      position: beat.position,
      transitionMs: beat.transitionMs,
      holdMs: beat.holdMs,
      bezier: resolveScrollCurve(beat.curve),
    })),
  };
}

async function resolveLegacyDocumentBeats(
  page: Page,
  options: RunScrollOptions,
  maxScroll: number,
  safeViewport: SafeViewport,
) {
  const pauses = normalizePauseTriggers(options.pauseTriggers ?? []);
  const pauseTargets: Array<{ target: MotionTarget; position: number; holdMs: number }> = [];
  for (const pause of pauses) {
    const target: MotionTarget = { type: "selector", selector: pause.selector, align: "center" };
    const position = await resolveDocumentTarget(page, target, maxScroll, options.viewportHeight, safeViewport);
    pauseTargets.push({ target, position, holdMs: pause.durationMs });
  }
  pauseTargets.sort((a, b) => a.position - b.position);
  const targets = [
    ...pauseTargets,
    { target: { type: "page-end" } as MotionTarget, position: maxScroll, holdMs: 0 },
  ].filter((target, index, all) => index === 0 || target.position > all[index - 1].position + 1 || target.holdMs > 0);
  const defaultMovementMs = Math.max(1000, (Math.ceil(maxScroll / Math.max(1, options.pixelsPerFrame)) / (options.frameRecorder?.getFps() ?? 30)) * 1000);
  let movementMs = options.animationConfig?.durationMs ?? defaultMovementMs;
  const scrollSync = (options.animationConfig as any)?.scrollSync;
  if (scrollSync && scrollSync.refMaxScroll > 0 && scrollSync.refDurationMs > 0) {
    const refSpeed = scrollSync.refMaxScroll / scrollSync.refDurationMs;
    if (refSpeed > 0) {
      movementMs = Math.max(1, Math.round(maxScroll / refSpeed));
    }
  }
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
  return { beats: resolved, timeline, adjustments: [] };
}

function resolveLegacyVirtualBeats(durationMs: number, bezier: BezierControlPoints) {
  const target: MotionTarget = { type: "page-end" };
  return {
    beats: [{ target, position: 1, transitionMs: durationMs, holdMs: 0, curve: { preset: "linear" } } satisfies ResolvedMotionBeat],
    timeline: [{ position: 1, transitionMs: durationMs, holdMs: 0, bezier }],
    adjustments: [],
  };
}

async function resolveDocumentTarget(
  page: Page,
  target: MotionTarget,
  maxScroll: number,
  viewportHeight: number,
  safeViewport: SafeViewport,
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
  if (!metrics) {
    if (target.fallbackProgress !== undefined) return maxScroll * target.fallbackProgress;
    throw new Error(`Direction selector was not found or visible: ${target.selector}`);
  }
  return alignedDocumentPosition({
    y: metrics.top,
    height: metrics.height,
    align: target.align ?? "center",
    offsetPx: target.offsetPx ?? 0,
    safeViewport,
    viewportHeight,
    maxScroll,
  });
}

function validateBeat(beat: MotionBeat) {
  if (!Number.isFinite(beat.transitionMs) || beat.transitionMs < 250 || beat.transitionMs > 60_000) {
    throw new Error("Each direction transitionMs must be between 250 and 60000");
  }
  const holdMs = beat.holdMs ?? 0;
  if (!Number.isFinite(holdMs) || holdMs < 0 || holdMs > 15_000) {
    throw new Error("Each direction holdMs must be between 0 and 15000");
  }
  if (beat.interaction) {
    if (beat.target.type !== "selector") {
      throw new Error("Component interactions require a selector target from inspect_website");
    }
    if (holdMs < 900) {
      throw new Error("Interactive beats require holdMs of at least 900ms");
    }
    const zoomScale = beat.interaction.zoomScale ?? 1.25;
    if (!Number.isFinite(zoomScale) || zoomScale < 1 || zoomScale > 1.8) {
      throw new Error("Interaction zoomScale must be between 1 and 1.8");
    }
  }
  if (
    beat.target.type === "selector"
    && beat.target.fallbackProgress !== undefined
    && (!Number.isFinite(beat.target.fallbackProgress) || beat.target.fallbackProgress < 0 || beat.target.fallbackProgress > 1)
  ) {
    throw new Error("Selector fallbackProgress must be between 0 and 1");
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
