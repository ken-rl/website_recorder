import {
  buildTimelineBlocks,
  clampPauseAtMs,
  sourceMsToExportMs,
  type EditorPauseInput,
} from "../../lib/editorTimeline";
import { MAX_HOLD_MS, MIN_HOLD_MS } from "../utils";

export type PauseDragMode = "move" | "resize";

export interface PauseDragState {
  pauseId: string;
  mode: PauseDragMode;
  dragOffsetMs: number;
}

export function createPauseMoveDrag(
  pauseId: string,
  pauseAtMs: number,
  clientX: number,
  sourceMsFromClientX: (x: number) => number,
): PauseDragState {
  return {
    pauseId,
    mode: "move",
    dragOffsetMs: pauseAtMs - sourceMsFromClientX(clientX),
  };
}

export function createPauseResizeDrag(pauseId: string): PauseDragState {
  return {
    pauseId,
    mode: "resize",
    dragOffsetMs: 0,
  };
}

export function computePausePreview(
  drag: PauseDragState,
  clientX: number,
  sourceMsFromClientX: (x: number) => number,
  trimStartMs: number,
  trimEndMs: number,
  pauses: EditorPauseInput[],
): EditorPauseInput[] {
  if (drag.mode === "resize") {
    const pause = pauses.find((entry) => entry.id === drag.pauseId);
    if (!pause) return pauses;

    const visualEndMs = sourceMsFromClientX(clientX);
    const nextHold = Math.min(
      MAX_HOLD_MS,
      Math.max(MIN_HOLD_MS, visualEndMs - pause.atMs),
    );

    return pauses.map((entry) =>
      entry.id === drag.pauseId ? { ...entry, holdMs: nextHold } : entry,
    );
  }

  const nextAt = clampPauseAtMs(
    sourceMsFromClientX(clientX) + drag.dragOffsetMs,
    drag.pauseId,
    trimStartMs,
    trimEndMs,
    pauses,
  );

  return pauses.map((pause) =>
    pause.id === drag.pauseId ? { ...pause, atMs: nextAt } : pause,
  );
}

export function pauseMoveSeekExportMs(
  pauses: EditorPauseInput[],
  pauseId: string,
  trimStartMs: number,
  trimEndMs: number,
): number {
  const pause = pauses.find((entry) => entry.id === pauseId);
  if (!pause) return 0;
  const blocks = buildTimelineBlocks(trimStartMs, trimEndMs, pauses);
  return sourceMsToExportMs(pause.atMs, blocks);
}
