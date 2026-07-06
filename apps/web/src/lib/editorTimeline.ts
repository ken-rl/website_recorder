export interface EditorPauseInput {
  id: string;
  atMs: number;
  holdMs: number;
}

export interface TimelineBlock {
  type: "play" | "freeze";
  exportStartMs: number;
  exportEndMs: number;
  sourceStartMs: number;
  sourceEndMs: number;
  pauseId?: string;
}

export function buildTimelineBlocks(
  trimStartMs: number,
  trimEndMs: number,
  pauses: EditorPauseInput[],
): TimelineBlock[] {
  const sorted = [...pauses]
    .filter((pause) => pause.atMs >= trimStartMs && pause.atMs <= trimEndMs)
    .sort((a, b) => a.atMs - b.atMs);

  const blocks: TimelineBlock[] = [];
  let sourceCursor = trimStartMs;
  let exportCursor = 0;

  for (const pause of sorted) {
    if (pause.atMs > sourceCursor) {
      const playDuration = pause.atMs - sourceCursor;
      blocks.push({
        type: "play",
        exportStartMs: exportCursor,
        exportEndMs: exportCursor + playDuration,
        sourceStartMs: sourceCursor,
        sourceEndMs: pause.atMs,
      });
      exportCursor += playDuration;
    }

    blocks.push({
      type: "freeze",
      exportStartMs: exportCursor,
      exportEndMs: exportCursor + pause.holdMs,
      sourceStartMs: pause.atMs,
      sourceEndMs: pause.atMs,
      pauseId: pause.id,
    });
    exportCursor += pause.holdMs;
    sourceCursor = pause.atMs;
  }

  if (sourceCursor < trimEndMs) {
    const playDuration = trimEndMs - sourceCursor;
    blocks.push({
      type: "play",
      exportStartMs: exportCursor,
      exportEndMs: exportCursor + playDuration,
      sourceStartMs: sourceCursor,
      sourceEndMs: trimEndMs,
    });
    exportCursor += playDuration;
  }

  if (blocks.length === 0 && trimEndMs > trimStartMs) {
    blocks.push({
      type: "play",
      exportStartMs: 0,
      exportEndMs: trimEndMs - trimStartMs,
      sourceStartMs: trimStartMs,
      sourceEndMs: trimEndMs,
    });
  }

  return blocks;
}

export function getExportDurationMs(blocks: TimelineBlock[]) {
  if (blocks.length === 0) return 0;
  return blocks[blocks.length - 1].exportEndMs;
}

export function findBlockAtExportMs(
  exportMs: number,
  blocks: TimelineBlock[],
): TimelineBlock | null {
  for (const block of blocks) {
    if (exportMs >= block.exportStartMs && exportMs < block.exportEndMs) {
      return block;
    }
  }
  if (blocks.length > 0 && exportMs >= blocks[blocks.length - 1].exportEndMs) {
    return blocks[blocks.length - 1];
  }
  return blocks[0] ?? null;
}

export function findPlayBlockAtSourceMs(
  sourceMs: number,
  blocks: TimelineBlock[],
): TimelineBlock | null {
  for (const block of blocks) {
    if (
      block.type === "play" &&
      sourceMs >= block.sourceStartMs &&
      sourceMs < block.sourceEndMs
    ) {
      return block;
    }
  }
  return null;
}

export function blockAfter(
  block: TimelineBlock,
  blocks: TimelineBlock[],
): TimelineBlock | null {
  const index = blocks.indexOf(block);
  if (index < 0) return null;
  return blocks[index + 1] ?? null;
}

export function exportMsToSourceMs(
  exportMs: number,
  blocks: TimelineBlock[],
): number {
  const block = findBlockAtExportMs(exportMs, blocks);
  if (!block) return 0;

  if (block.type === "freeze") {
    return block.sourceStartMs;
  }

  const offset = exportMs - block.exportStartMs;
  return block.sourceStartMs + offset;
}

export interface EditorPauseLike {
  id: string;
  atMs: number;
}

export function clampPauseAtMs(
  atMs: number,
  pauseId: string,
  trimStartMs: number,
  trimEndMs: number,
  pauses: EditorPauseLike[],
  minGapMs = 100,
): number {
  const sorted = pauses
    .filter((pause) => pause.id !== pauseId)
    .sort((a, b) => a.atMs - b.atMs);

  let lower = trimStartMs;
  let upper = trimEndMs;

  for (const pause of sorted) {
    if (pause.atMs < atMs) {
      lower = Math.max(lower, pause.atMs + minGapMs);
      continue;
    }
    upper = Math.min(upper, pause.atMs - minGapMs);
    break;
  }

  return Math.round(Math.min(upper, Math.max(lower, atMs)));
}

export function exportMsToPlayback(
  exportMs: number,
  blocks: TimelineBlock[],
): { sourceMs: number; isFrozen: boolean } {
  const block = findBlockAtExportMs(exportMs, blocks);
  if (!block) return { sourceMs: 0, isFrozen: false };

  if (block.type === "freeze") {
    return { sourceMs: block.sourceStartMs, isFrozen: true };
  }

  const offset = exportMs - block.exportStartMs;
  return {
    sourceMs: block.sourceStartMs + offset,
    isFrozen: false,
  };
}

export function sourceMsToExportMs(
  sourceMs: number,
  blocks: TimelineBlock[],
): number {
  for (const block of blocks) {
    if (block.type === "play") {
      if (sourceMs >= block.sourceStartMs && sourceMs < block.sourceEndMs) {
        return block.exportStartMs + (sourceMs - block.sourceStartMs);
      }
      if (sourceMs === block.sourceEndMs) {
        return block.exportEndMs;
      }
      continue;
    }

    if (sourceMs === block.sourceStartMs) {
      return block.exportStartMs;
    }
  }

  const last = blocks[blocks.length - 1];
  return last?.exportEndMs ?? 0;
}

export function exportPercent(exportMs: number, exportDurationMs: number) {
  if (exportDurationMs <= 0) return 0;
  return (exportMs / exportDurationMs) * 100;
}

export function sourcePercent(sourceMs: number, sourceDurationMs: number) {
  if (sourceDurationMs <= 0) return 0;
  return (sourceMs / sourceDurationMs) * 100;
}

export function sourceMsFromRatio(ratio: number, sourceDurationMs: number) {
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.round(clamped * sourceDurationMs);
}

/** Playhead position on the full source timeline (pauses pin to source frame). */
export function exportMsToSourcePlayheadPercent(
  exportMs: number,
  sourceDurationMs: number,
  blocks: TimelineBlock[],
) {
  if (sourceDurationMs <= 0) return 0;
  const { sourceMs } = exportMsToPlayback(exportMs, blocks);
  return sourcePercent(sourceMs, sourceDurationMs);
}

export function clampSourceMs(
  sourceMs: number,
  trimStartMs: number,
  trimEndMs: number,
) {
  return Math.min(trimEndMs, Math.max(trimStartMs, sourceMs));
}

export interface SourcePlaybackPosition {
  block: TimelineBlock;
  atEnd: boolean;
  skippedFreeze?: TimelineBlock;
}

export function resolveSourcePlaybackPosition(
  sourceMs: number,
  blocks: TimelineBlock[],
  endToleranceMs = 40,
): SourcePlaybackPosition | null {
  for (const block of blocks) {
    if (
      block.type === "play" &&
      sourceMs >= block.sourceStartMs &&
      sourceMs < block.sourceEndMs - endToleranceMs
    ) {
      return { block, atEnd: false };
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "play") {
      if (
        sourceMs >= block.sourceEndMs - endToleranceMs &&
        sourceMs <= block.sourceEndMs + endToleranceMs
      ) {
        return { block, atEnd: true };
      }
      if (sourceMs > block.sourceEndMs + endToleranceMs) {
        const next = blocks[i + 1];
        if (next?.type === "freeze") {
          const afterFreeze = blocks[i + 2];
          if (
            afterFreeze?.type === "play" &&
            sourceMs >= afterFreeze.sourceStartMs
          ) {
            return { block, atEnd: true, skippedFreeze: next };
          }
        }
      }
    }
  }

  for (const block of blocks) {
    if (
      block.type === "play" &&
      sourceMs >= block.sourceStartMs &&
      sourceMs < block.sourceEndMs
    ) {
      return { block, atEnd: false };
    }
  }

  return null;
}

export function sourceMsFromTrimRatio(
  ratio: number,
  trimStartMs: number,
  trimEndMs: number,
): number {
  if (trimEndMs <= trimStartMs) return trimStartMs;
  return Math.round(
    trimStartMs + Math.min(1, Math.max(0, ratio)) * (trimEndMs - trimStartMs),
  );
}
