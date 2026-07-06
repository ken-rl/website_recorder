import { sourceMsFromRatio } from "../lib/editorTimeline";

export const CLICK_DRAG_THRESHOLD_PX = 5;
export const MIN_TRIM_MS = 250;
export const MIN_HOLD_MS = 100;
export const MAX_HOLD_MS = 30000;
export const MIN_PAUSE_GAP_MS = 100;

export function sourceMsFromClientX(
  clientX: number,
  timelineEl: HTMLElement | null,
  sourceDurationMs: number,
): number {
  if (!timelineEl || sourceDurationMs <= 0) return 0;
  const rect = timelineEl.getBoundingClientRect();
  const ratio = (clientX - rect.left) / rect.width;
  return sourceMsFromRatio(ratio, sourceDurationMs);
}

export function pointerDelta(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
): number {
  const dx = clientX - startX;
  const dy = clientY - startY;
  return Math.sqrt(dx * dx + dy * dy);
}

export interface SnapTarget {
  ms: number;
  label: string;
}

export function pauseHoldWidthPercent(
  holdMs: number,
  sourceDurationMs: number,
): number {
  if (sourceDurationMs <= 0) return 0;
  return (holdMs / sourceDurationMs) * 100;
}

export function snapSourceMs(
  ms: number,
  targets: SnapTarget[],
  thresholdMs: number,
): number {
  let closest = ms;
  let closestDist = thresholdMs + 1;

  for (const target of targets) {
    const dist = Math.abs(target.ms - ms);
    if (dist <= thresholdMs && dist < closestDist) {
      closest = target.ms;
      closestDist = dist;
    }
  }

  return closest;
}
