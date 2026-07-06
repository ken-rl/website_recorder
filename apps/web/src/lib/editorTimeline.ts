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
      continue;
    }

    if (sourceMs === block.sourceStartMs) {
      return block.exportStartMs;
    }
  }

  const last = blocks[blocks.length - 1];
  return last?.exportEndMs ?? sourceMs;
}

export function exportPercent(exportMs: number, exportDurationMs: number) {
  if (exportDurationMs <= 0) return 0;
  return (exportMs / exportDurationMs) * 100;
}
