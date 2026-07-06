import type { BezierControlPoints } from "./curves.js";

export function sampleCurveX(t: number, bezier: BezierControlPoints) {
  const [x1, , x2] = bezier;
  const inv = 1 - t;
  return 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t;
}

export function sampleCurveY(t: number, bezier: BezierControlPoints) {
  const [, y1, , y2] = bezier;
  const inv = 1 - t;
  return 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t;
}

function sampleCurveDerivativeX(t: number, bezier: BezierControlPoints) {
  const [x1, , x2] = bezier;
  return (
    3 * (1 - t) * (1 - t) * x1 +
    6 * (1 - t) * t * (x2 - x1) +
    3 * t * t * (1 - x2)
  );
}

export function applyScrollCurve(
  linearProgress: number,
  bezier: BezierControlPoints,
) {
  if (linearProgress <= 0) return 0;
  if (linearProgress >= 1) return 1;

  let start = 0;
  let end = 1;
  let param = linearProgress;

  for (let i = 0; i < 8; i += 1) {
    param = (start + end) / 2;
    const x = sampleCurveX(param, bezier);
    if (x < linearProgress) start = param;
    else end = param;
  }

  param = (start + end) / 2;
  const dx = sampleCurveDerivativeX(param, bezier);
  if (Math.abs(dx) > 1e-6) {
    param -= (sampleCurveX(param, bezier) - linearProgress) / dx;
  }

  return sampleCurveY(Math.min(1, Math.max(0, param)), bezier);
}
