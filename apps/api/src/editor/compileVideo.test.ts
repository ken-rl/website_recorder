import assert from "node:assert/strict";
import test from "node:test";
import { applyBezierCurve } from "./compileVideo.js";

test("Bézier easing preserves the endpoints", () => {
  const curve: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

  assert.equal(applyBezierCurve(0, curve), 0);
  assert.equal(applyBezierCurve(1, curve), 1);
});

test("linear Bézier easing returns linear progress", () => {
  const curve: [number, number, number, number] = [0, 0, 1, 1];

  for (const progress of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    assert.ok(Math.abs(applyBezierCurve(progress, curve) - progress) < 0.001);
  }
});

test("standard ease curve uses the Y control points", () => {
  const curve: [number, number, number, number] = [0.25, 0.1, 0.25, 1];
  const midpoint = applyBezierCurve(0.5, curve);

  // CSS cubic-bezier(0.25, 0.1, 0.25, 1) evaluates to approximately 0.8024 at x=.5.
  assert.ok(Math.abs(midpoint - 0.8024) < 0.002);
});
