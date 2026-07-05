import type { ScrollCurve, ScrollCurvePreset } from "../types.js";

export type BezierControlPoints = [number, number, number, number];

const PRESET_BEZIERS: Record<
  Exclude<ScrollCurvePreset, "custom">,
  BezierControlPoints
> = {
  linear: [0, 0, 1, 1],
  "ease-in": [0.65, 0, 1, 0.45],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
  "ease-in-cubic": [0.55, 0.055, 0.675, 0.19],
  "ease-out-cubic": [0.215, 0.61, 0.355, 1],
  "ease-in-out-cubic": [0.645, 0.045, 0.355, 1],
};

export function resolveScrollCurve(curve?: ScrollCurve): BezierControlPoints {
  const preset = curve?.preset ?? "linear";

  if (preset === "custom") {
    if (!curve?.bezier) {
      throw new Error('scrollCurve.bezier is required when preset is "custom"');
    }
    return validateBezier(curve.bezier);
  }

  return PRESET_BEZIERS[preset];
}

function validateBezier(bezier: number[]): BezierControlPoints {
  if (!Array.isArray(bezier) || bezier.length !== 4) {
    throw new Error(
      "scrollCurve.bezier must be an array of four numbers [x1, y1, x2, y2]",
    );
  }

  const [x1, y1, x2, y2] = bezier;
  for (const value of bezier) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error("scrollCurve.bezier values must be numbers");
    }
  }

  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new Error(
      "scrollCurve.bezier x control points must be between 0 and 1",
    );
  }

  return [x1, y1, x2, y2];
}
