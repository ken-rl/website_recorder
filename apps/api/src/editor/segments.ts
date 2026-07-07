import type { EditorPause, EditorZoom } from "../types.js";

export interface PlaySegment {
  type: "play";
  startMs: number;
  endMs: number;
  speedType?: "normal" | "decelerate" | "accelerate";
  zoom: {
    startScale: number;
    endScale: number;
    startX: number;
    endX: number;
    startY: number;
    endY: number;
  };
}

export interface FreezeSegment {
  type: "freeze";
  atMs: number;
  holdMs: number;
  zoom: {
    scale: number;
    x: number;
    y: number;
  };
}

export type EditSegment = PlaySegment | FreezeSegment;

export function getZoomStateAt(
  t: number,
  zooms: EditorZoom[],
): { scale: number; x: number; y: number } {
  // Find if t falls within any zoom block
  const activeZoom = zooms.find((z) => t >= z.atMs && t <= z.atMs + z.durationMs);

  if (!activeZoom) {
    return { scale: 1.0, x: 0.5, y: 0.5 };
  }

  const trans = Math.min(500, activeZoom.durationMs / 2);

  if (t < activeZoom.atMs + trans) {
    // Zooming in
    const ratio = (t - activeZoom.atMs) / trans;
    const eased = Math.max(0, Math.min(1, ratio));
    return {
      scale: 1.0 + (activeZoom.scale - 1.0) * eased,
      x: activeZoom.x,
      y: activeZoom.y,
    };
  }

  if (t > activeZoom.atMs + activeZoom.durationMs - trans) {
    // Zooming out
    const ratio = (activeZoom.atMs + activeZoom.durationMs - t) / trans;
    const eased = Math.max(0, Math.min(1, ratio));
    return {
      scale: 1.0 + (activeZoom.scale - 1.0) * eased,
      x: activeZoom.x,
      y: activeZoom.y,
    };
  }

  // Full zoom hold
  return {
    scale: activeZoom.scale,
    x: activeZoom.x,
    y: activeZoom.y,
  };
}

export function buildEditSegments(
  trimStartMs: number,
  trimEndMs: number,
  pauses: EditorPause[],
  zooms: EditorZoom[] = [],
): EditSegment[] {
  // Collect all potential split points
  const splitPointsSet = new Set<number>();
  splitPointsSet.add(trimStartMs);
  splitPointsSet.add(trimEndMs);

  for (const pause of pauses) {
    const p1 = pause.atMs - 300;
    const p2 = pause.atMs;
    const p3 = pause.atMs + 300;

    if (p1 >= trimStartMs && p1 <= trimEndMs) splitPointsSet.add(p1);
    if (p2 >= trimStartMs && p2 <= trimEndMs) splitPointsSet.add(p2);
    if (p3 >= trimStartMs && p3 <= trimEndMs) splitPointsSet.add(p3);
  }

  for (const zoom of zooms) {
    const trans = Math.min(500, zoom.durationMs / 2);
    const p1 = zoom.atMs;
    const p2 = zoom.atMs + trans;
    const p3 = zoom.atMs + zoom.durationMs - trans;
    const p4 = zoom.atMs + zoom.durationMs;

    if (p1 >= trimStartMs && p1 <= trimEndMs) splitPointsSet.add(p1);
    if (p2 >= trimStartMs && p2 <= trimEndMs) splitPointsSet.add(p2);
    if (p3 >= trimStartMs && p3 <= trimEndMs) splitPointsSet.add(p3);
    if (p4 >= trimStartMs && p4 <= trimEndMs) splitPointsSet.add(p4);
  }

  const splitPoints = Array.from(splitPointsSet).sort((a, b) => a - b);

  const sortedPauses = [...pauses]
    .filter((pause) => pause.atMs >= trimStartMs && pause.atMs <= trimEndMs)
    .sort((a, b) => a.atMs - b.atMs);

  const pauseMap = new Map<number, number>();
  for (const pause of sortedPauses) {
    const current = pauseMap.get(pause.atMs) ?? 0;
    pauseMap.set(pause.atMs, current + pause.holdMs);
  }

  const sortedZooms = [...zooms].sort((a, b) => a.atMs - b.atMs);
  const segments: EditSegment[] = [];

  for (let index = 0; index < splitPoints.length - 1; index += 1) {
    const start = splitPoints[index];
    const end = splitPoints[index + 1];

    const holdMs = pauseMap.get(start);
    if (holdMs && holdMs > 0) {
      const zoomState = getZoomStateAt(start, sortedZooms);
      segments.push({
        type: "freeze",
        atMs: start,
        holdMs,
        zoom: zoomState,
      });
    }

    if (end > start) {
      const zoomStart = getZoomStateAt(start, sortedZooms);
      const zoomEnd = getZoomStateAt(end, sortedZooms);

      let speedType: "normal" | "decelerate" | "accelerate" = "normal";
      const isDecel = sortedPauses.some((p) => Math.abs(end - p.atMs) < 2);
      const isAccel = sortedPauses.some((p) => Math.abs(start - p.atMs) < 2);

      if (isDecel) {
        speedType = "decelerate";
      } else if (isAccel) {
        speedType = "accelerate";
      }

      segments.push({
        type: "play",
        startMs: start,
        endMs: end,
        speedType,
        zoom: {
          startScale: zoomStart.scale,
          endScale: zoomEnd.scale,
          startX: zoomStart.x,
          endX: zoomEnd.x,
          startY: zoomStart.y,
          endY: zoomEnd.y,
        },
      });
    }
  }

  const lastPoint = splitPoints[splitPoints.length - 1];
  const lastHoldMs = pauseMap.get(lastPoint);
  if (lastHoldMs && lastHoldMs > 0) {
    const zoomState = getZoomStateAt(lastPoint, sortedZooms);
    segments.push({
      type: "freeze",
      atMs: lastPoint,
      holdMs: lastHoldMs,
      zoom: zoomState,
    });
  }

  return segments;
}
