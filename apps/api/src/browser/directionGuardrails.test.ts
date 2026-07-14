import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedMotionBeat } from "../types.js";
import { normalizeResolvedBeats, peakCurveSlope } from "./directionGuardrails.js";
import { buildMotionTimeline } from "./motion.js";
import { resolveScrollCurve } from "./curves.js";

const beat = (overrides: Partial<ResolvedMotionBeat>): ResolvedMotionBeat => ({
  target: { type: "progress", value: 0.5 },
  position: 1000,
  transitionMs: 1000,
  holdMs: 0,
  curve: { preset: "ease-in-out" },
  ...overrides,
});

test("resolved timelines respect the per-frame velocity limit at 30 and 60 FPS", () => {
  for (const fps of [30, 60]) {
    const result = normalizeResolvedBeats({
      beats: [beat({ position: 2600, transitionMs: 1800, curve: { preset: "ease-out-cubic" } })],
      startHoldMs: 0,
      viewportHeight: 900,
    });
    const resolved = result.beats[0];
    const frames = buildMotionTimeline({
      fps,
      beats: [{
        position: resolved.position,
        transitionMs: resolved.transitionMs,
        holdMs: 0,
        bezier: resolveScrollCurve(resolved.curve),
      }],
    });
    const maxDelta = Math.max(...frames.slice(1).map((frame, index) => frame.position - frames[index].position));
    assert.ok(maxDelta <= 900 * 1.5 / fps + 0.1);
  }
});

test("does not append or alter an intentional partial final target", () => {
  const result = normalizeResolvedBeats({
    beats: [beat({ position: 5000, target: { type: "progress", value: 0.5 }, transitionMs: 10_000 })],
    startHoldMs: 0,
    viewportHeight: 900,
  });
  assert.equal(result.beats.length, 1);
  assert.deepEqual(result.beats[0].target, { type: "progress", value: 0.5 });
});

test("merges a redundant page-end beat without stacking holds", () => {
  const result = normalizeResolvedBeats({
    beats: [
      beat({ position: 9952, holdMs: 800, target: { type: "progress", value: 0.9954 } }),
      beat({ position: 9998, holdMs: 600, target: { type: "page-end" } }),
    ],
    startHoldMs: 0,
    viewportHeight: 900,
  });
  assert.equal(result.beats.length, 1);
  assert.equal(result.beats[0].position, 9952);
  assert.equal(result.beats[0].holdMs, 800);
  assert.equal(result.adjustments[0].code, "merged-nearby-beat");
});

test("replaces a harsh departure after a hold", () => {
  const result = normalizeResolvedBeats({
    beats: [beat({ curve: { preset: "ease-out-cubic" }, position: 2600 })],
    startHoldMs: 650,
    viewportHeight: 900,
  });
  assert.equal(result.beats[0].curve.preset, "ease-in-out-cubic");
  assert.ok(result.adjustments.some((item) => item.code === "replaced-boundary-curve"));
});

test("replaces the standard ease-out curve after a hold", () => {
  const result = normalizeResolvedBeats({
    beats: [beat({ curve: { preset: "ease-out" }, position: 600 })],
    startHoldMs: 500,
    viewportHeight: 900,
  });
  assert.equal(result.beats[0].curve.preset, "ease-in-out-cubic");
});

test("stretches fast movement to the viewport-relative velocity limit", () => {
  const result = normalizeResolvedBeats({
    beats: [beat({ position: 2600, transitionMs: 1800, curve: { preset: "ease-in-out-cubic" } })],
    startHoldMs: 0,
    viewportHeight: 900,
  });
  const resolved = result.beats[0];
  const peakVelocity = 2600 * peakCurveSlope(resolved.curve) / (resolved.transitionMs / 1000);
  assert.ok(peakVelocity <= 1350.1);
  assert.ok(resolved.transitionMs > 1800);
});
