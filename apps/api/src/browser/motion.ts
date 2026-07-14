import type { BezierControlPoints } from "./curves.js";
import { applyScrollCurve } from "./scrollEasing.js";

export interface TimelineBeat {
  position: number;
  transitionMs: number;
  holdMs: number;
  bezier: BezierControlPoints;
}

export interface MotionSample {
  position: number;
  phase: "transition" | "hold";
  beatIndex: number;
}

export function buildMotionTimeline(options: {
  fps: number;
  startPosition?: number;
  startHoldMs?: number;
  beats: TimelineBeat[];
}): MotionSample[] {
  const fps = Math.max(1, options.fps);
  const samples: MotionSample[] = [];
  let position = options.startPosition ?? 0;

  const startHoldFrames = framesForDuration(options.startHoldMs ?? 0, fps);
  for (let frame = 0; frame < startHoldFrames; frame += 1) {
    samples.push({ position, phase: "hold", beatIndex: -1 });
  }

  options.beats.forEach((beat, beatIndex) => {
    const start = position;
    const transitionFrames = Math.max(1, framesForDuration(beat.transitionMs, fps));
    for (let frame = 1; frame <= transitionFrames; frame += 1) {
      const progress = frame / transitionFrames;
      const eased = applyScrollCurve(progress, beat.bezier);
      samples.push({
        position: start + (beat.position - start) * eased,
        phase: "transition",
        beatIndex,
      });
    }
    position = beat.position;

    const holdFrames = framesForDuration(beat.holdMs, fps);
    for (let frame = 0; frame < holdFrames; frame += 1) {
      samples.push({ position, phase: "hold", beatIndex });
    }
  });

  if (samples.length === 0) {
    samples.push({ position, phase: "hold", beatIndex: -1 });
  }
  return samples;
}

export function framesForDuration(durationMs: number, fps: number) {
  return Math.max(0, Math.round((Math.max(0, durationMs) / 1000) * fps));
}
