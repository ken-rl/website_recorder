import type { EditorPause } from "../types.js";

export interface PlaySegment {
  type: "play";
  startMs: number;
  endMs: number;
}

export interface FreezeSegment {
  type: "freeze";
  atMs: number;
  holdMs: number;
}

export type EditSegment = PlaySegment | FreezeSegment;

export function buildEditSegments(
  trimStartMs: number,
  trimEndMs: number,
  pauses: EditorPause[],
): EditSegment[] {
  const sorted = [...pauses]
    .filter((pause) => pause.atMs >= trimStartMs && pause.atMs <= trimEndMs)
    .sort((a, b) => a.atMs - b.atMs);

  const deduped: EditorPause[] = [];
  for (const pause of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.atMs === pause.atMs) {
      last.holdMs += pause.holdMs;
      continue;
    }
    deduped.push({ ...pause });
  }

  const segments: EditSegment[] = [];
  let cursor = trimStartMs;

  for (const pause of deduped) {
    if (pause.atMs > cursor) {
      segments.push({
        type: "play",
        startMs: cursor,
        endMs: pause.atMs,
      });
    }
    segments.push({
      type: "freeze",
      atMs: pause.atMs,
      holdMs: pause.holdMs,
    });
    cursor = pause.atMs;
  }

  if (cursor < trimEndMs) {
    segments.push({
      type: "play",
      startMs: cursor,
      endMs: trimEndMs,
    });
  }

  if (segments.length === 0 && trimEndMs > trimStartMs) {
    segments.push({
      type: "play",
      startMs: trimStartMs,
      endMs: trimEndMs,
    });
  }

  return segments;
}
