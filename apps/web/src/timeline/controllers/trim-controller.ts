import { buildTimelineBlocks, sourceMsToExportMs } from "../../lib/editorTimeline";
import type { EditorPauseInput } from "../../lib/editorTimeline";
import { MIN_TRIM_MS, snapSourceMs, type SnapTarget } from "../utils";

export type TrimHandle = "start" | "end";

export interface TrimState {
  trimStartMs: number;
  trimEndMs: number;
  sourceDurationMs: number;
}

export interface TrimPreview extends TrimState {
  handle: TrimHandle;
}

export interface TrimDragContext {
  committed: TrimState;
  pauses: EditorPauseInput[];
  playheadSourceMs?: number;
  snapThresholdMs?: number;
}

export function buildTrimSnapTargets(
  ctx: TrimDragContext,
  handle: TrimHandle,
): SnapTarget[] {
  const targets: SnapTarget[] = [];

  if (ctx.playheadSourceMs !== undefined) {
    targets.push({ ms: ctx.playheadSourceMs, label: "playhead" });
  }

  for (const pause of ctx.pauses) {
    if (pause.atMs > ctx.committed.trimStartMs && pause.atMs < ctx.committed.trimEndMs) {
      targets.push({ ms: pause.atMs, label: "pause" });
    }
  }

  if (handle === "start") {
    targets.push({ ms: 0, label: "source-start" });
  } else {
    targets.push({ ms: ctx.committed.sourceDurationMs, label: "source-end" });
  }

  return targets;
}

export function computeTrimPreview(
  handle: TrimHandle,
  rawSourceMs: number,
  ctx: TrimDragContext,
): TrimPreview {
  const { committed, snapThresholdMs = 80 } = ctx;
  const snapTargets = buildTrimSnapTargets(ctx, handle);
  const snapped = snapSourceMs(rawSourceMs, snapTargets, snapThresholdMs);

  if (handle === "start") {
    const trimStartMs = Math.max(
      0,
      Math.min(snapped, committed.trimEndMs - MIN_TRIM_MS),
    );
    return {
      handle,
      trimStartMs,
      trimEndMs: committed.trimEndMs,
      sourceDurationMs: committed.sourceDurationMs,
    };
  }

  const trimEndMs = Math.min(
    committed.sourceDurationMs,
    Math.max(snapped, committed.trimStartMs + MIN_TRIM_MS),
  );
  return {
    handle,
    trimStartMs: committed.trimStartMs,
    trimEndMs,
    sourceDurationMs: committed.sourceDurationMs,
  };
}

export function previewSeekExportMs(
  preview: TrimPreview,
  pauses: EditorPauseInput[],
): number {
  const blocks = buildTimelineBlocks(
    preview.trimStartMs,
    preview.trimEndMs,
    pauses,
  );

  if (preview.handle === "start") {
    return sourceMsToExportMs(preview.trimStartMs, blocks);
  }

  return Math.max(0, sourceMsToExportMs(preview.trimEndMs, blocks) - 1);
}

export function commitTrimPreview(preview: TrimPreview): {
  trimStartMs: number;
  trimEndMs: number;
} {
  return {
    trimStartMs: preview.trimStartMs,
    trimEndMs: preview.trimEndMs,
  };
}
