import type { AnimationConfig } from "../types.js";

export interface VirtualScrollSettings {
  durationMs: number;
  wheelBudget: number;
  cycles: number;
}

/** Wall-clock seconds per viewport cycle for virtual scroll (not document pixelsPerFrame). */
const SECONDS_PER_CYCLE_NORMAL = 1.25;
const SECONDS_PER_CYCLE_FAST = 0.75;

export function resolveVirtualScrollSettings(
  animation: AnimationConfig,
  viewportHeight: number,
  _pixelsPerFrame: number,
  fastMode: boolean,
): VirtualScrollSettings {
  const cycles = animation.virtualScrollCycles ?? (fastMode ? 6 : 8);
  const wheelBudget = cycles * viewportHeight;
  const secondsPerCycle = fastMode
    ? SECONDS_PER_CYCLE_FAST
    : SECONDS_PER_CYCLE_NORMAL;

  const durationMs =
    animation.virtualScrollDurationMs ??
    Math.round(cycles * secondsPerCycle * 1000);

  return {
    cycles,
    wheelBudget,
    durationMs,
  };
}
