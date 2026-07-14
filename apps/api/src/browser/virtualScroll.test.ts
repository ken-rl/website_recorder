import assert from "node:assert/strict";
import test from "node:test";
import type { MotionSample } from "./motion.js";
import { virtualWheelDelta } from "./virtualScroll.js";

test("virtual wheel deltas preserve the exact cumulative budget", () => {
  const samples: MotionSample[] = [0.1, 0.25, 0.25, 0.6, 1].map((position) => ({
    position,
    phase: "transition",
    beatIndex: 0,
  }));
  const deltas = samples.map((_, index) => virtualWheelDelta(samples, index, 7200));
  assert.equal(deltas.reduce((total, delta) => total + delta, 0), 7200);
  assert.equal(deltas[2], 0);
  assert.ok(deltas.every((delta) => delta >= 0));
});
