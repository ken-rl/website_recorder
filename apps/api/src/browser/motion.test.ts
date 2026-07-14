import assert from "node:assert/strict";
import test from "node:test";
import { buildMotionTimeline } from "./motion.js";

const linear: [number, number, number, number] = [0, 0, 1, 1];
const ease: [number, number, number, number] = [0.645, 0.045, 0.355, 1];

test("applies a linear transition exactly once", () => {
  const frames = buildMotionTimeline({
    fps: 10,
    beats: [{ position: 1000, transitionMs: 1000, holdMs: 0, bezier: linear }],
  });
  assert.equal(frames.length, 10);
  assert.ok(Math.abs(frames[4].position - 500) < 1);
  assert.equal(frames.at(-1)?.position, 1000);
});

test("holds add frames without compressing later transitions", () => {
  const frames = buildMotionTimeline({
    fps: 10,
    startHoldMs: 500,
    beats: [
      { position: 500, transitionMs: 1000, holdMs: 700, bezier: ease },
      { position: 1000, transitionMs: 1000, holdMs: 0, bezier: ease },
    ],
  });
  assert.equal(frames.length, 32);
  assert.equal(frames.filter((frame) => frame.phase === "hold").length, 12);
  assert.equal(frames.at(-1)?.position, 1000);
  assert.ok(frames.every((frame, index) => index === 0 || frame.position >= frames[index - 1].position));
});
