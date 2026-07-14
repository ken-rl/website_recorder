import type {
  MotionPlanAdjustment,
  MotionTarget,
  ResolvedMotionBeat,
  ScrollCurve,
} from "../types.js";
import { resolveScrollCurve } from "./curves.js";
import { applyScrollCurve } from "./scrollEasing.js";

const SAFE_CURVE: ScrollCurve = { preset: "ease-in-out-cubic" };
const MAX_VIEWPORTS_PER_SECOND = 1.5;

export function normalizeResolvedBeats(options: {
  beats: ResolvedMotionBeat[];
  startHoldMs: number;
  viewportHeight: number;
  /** Converts position units to CSS/wheel pixels. Document scroll uses 1. */
  positionScale?: number;
  adjustments?: MotionPlanAdjustment[];
}) {
  const scale = options.positionScale ?? 1;
  const mergeDistance = Math.max(100, options.viewportHeight * 0.12);
  const adjustments = [...(options.adjustments ?? [])];
  const merged: Array<ResolvedMotionBeat & { sourceIndex: number }> = [];

  options.beats.forEach((beat, sourceIndex) => {
    const previous = merged.at(-1);
    const distancePx = previous
      ? Math.abs(beat.position - previous.position) * scale
      : Number.POSITIVE_INFINITY;
    if (previous && distancePx <= mergeDistance) {
      const preferIncoming = targetRank(beat.target) > targetRank(previous.target);
      const requested = beat.target;
      if (preferIncoming) {
        previous.target = beat.target;
        previous.position = beat.position;
      }
      previous.holdMs = Math.max(previous.holdMs, beat.holdMs);
      adjustments.push({
        beatIndex: sourceIndex,
        code: "merged-nearby-beat",
        message: `Merged a target only ${Math.round(distancePx)}px from the previous beat`,
        requested,
        resolved: previous.target,
      });
      return;
    }
    merged.push({ ...beat, sourceIndex });
  });

  let previousPosition = 0;
  let previousHoldMs = options.startHoldMs;
  for (const beat of merged) {
    const bezier = resolveScrollCurve(beat.curve);
    const startSlope = applyScrollCurve(0.001, bezier) / 0.001;
    const endSlope = (1 - applyScrollCurve(0.999, bezier)) / 0.001;
    const startsFast = previousHoldMs > 0 && startSlope > 0.25;
    const stopsFast = beat.holdMs > 0 && endSlope > 0.25;
    if (startsFast || stopsFast) {
      const requested = beat.curve.preset ?? "custom";
      beat.curve = SAFE_CURVE;
      adjustments.push({
        beatIndex: beat.sourceIndex,
        code: "replaced-boundary-curve",
        message: "Replaced a curve that would start or stop abruptly at a hold",
        requested,
        resolved: SAFE_CURVE.preset!,
      });
    }

    const distancePx = Math.abs(beat.position - previousPosition) * scale;
    const peakSlope = peakCurveSlope(beat.curve);
    const maxVelocity = options.viewportHeight * MAX_VIEWPORTS_PER_SECOND;
    const minimumDurationMs = Math.ceil(
      ((distancePx * peakSlope) / Math.max(1, maxVelocity) * 1000) / 50,
    ) * 50;
    if (minimumDurationMs > beat.transitionMs) {
      const requested = beat.transitionMs;
      beat.transitionMs = minimumDurationMs;
      adjustments.push({
        beatIndex: beat.sourceIndex,
        code: "stretched-transition",
        message: `Stretched the transition to stay below ${MAX_VIEWPORTS_PER_SECOND} viewport heights per second`,
        requested,
        resolved: beat.transitionMs,
      });
    }
    previousPosition = beat.position;
    previousHoldMs = beat.holdMs;
  }

  return {
    beats: merged.map(({ sourceIndex: _sourceIndex, ...beat }) => beat),
    adjustments,
  };
}

export function peakCurveSlope(curve: ScrollCurve) {
  const bezier = resolveScrollCurve(curve);
  let previous = 0;
  let peak = 0;
  const sampleCount = 1000;
  for (let index = 1; index <= sampleCount; index += 1) {
    const value = applyScrollCurve(index / sampleCount, bezier);
    peak = Math.max(peak, (value - previous) * sampleCount);
    previous = value;
  }
  return peak;
}

function targetRank(target: MotionTarget) {
  if (target.type === "selector") return 3;
  if (target.type === "progress") return 2;
  return 1;
}
