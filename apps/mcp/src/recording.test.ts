import assert from "node:assert/strict";
import test from "node:test";
import { assertHttpUrl, buildRecordRequest } from "./recording.js";

test("allows a localhost development target", () => {
  assert.equal(assertHttpUrl("http://localhost:5173").hostname, "localhost");
});

test("rejects non-web URL schemes", () => {
  assert.throws(() => assertHttpUrl("file:///tmp/demo.html"), /HTTP\(S\)/);
});

test("maps cinematic slow direction to recorder settings", () => {
  const request = buildRecordRequest({
    targetUrl: "https://example.com",
    quality: "cinematic",
    pace: "slow",
    heroHoldMs: 2000,
    pauses: [{ selector: "#features", durationMs: 1500 }],
  });

  assert.equal(request.videoConfig.framerate, 60);
  assert.equal(request.videoConfig.viewport.deviceScaleFactor, 2);
  assert.equal(request.animationConfig?.pixelsPerFrame, 8);
  assert.deepEqual(request.animationConfig?.pauseTriggers, [{ selector: "#features", durationMs: 1500 }]);
});

test("requires a Bézier curve for a custom curve", () => {
  assert.throws(
    () => buildRecordRequest({ targetUrl: "https://example.com", curve: "custom" }),
    /customBezier/,
  );
});

test("maps section-level direction into the recorder request", () => {
  const direction = {
    startHoldMs: 1200,
    beats: [
      {
        target: { type: "selector" as const, selector: "#features", align: "center" as const },
        transitionMs: 2400,
        curve: { preset: "ease-in-out-cubic" as const },
        holdMs: 900,
      },
      { target: { type: "page-end" as const }, transitionMs: 3000 },
    ],
  };
  const request = buildRecordRequest({ targetUrl: "https://example.com", direction });
  assert.deepEqual(request.animationConfig?.direction, direction);
  assert.equal(request.animationConfig?.captureMode, "export");
});

test("defaults directed recordings to a 1500ms hero hold", () => {
  const request = buildRecordRequest({
    targetUrl: "https://example.com",
    direction: { beats: [{ target: { type: "page-end" }, transitionMs: 2000 }] },
  });
  assert.equal(request.animationConfig?.direction?.startHoldMs, 1500);
});

test("respects an explicit zero hero hold for directed recordings", () => {
  const request = buildRecordRequest({
    targetUrl: "https://example.com",
    direction: {
      startHoldMs: 0,
      beats: [{ target: { type: "page-end" }, transitionMs: 2000 }],
    },
  });
  assert.equal(request.animationConfig?.direction?.startHoldMs, 0);
});

test("does not mix direction beats with legacy global controls", () => {
  assert.throws(
    () => buildRecordRequest({
      targetUrl: "https://example.com",
      pace: "slow",
      direction: { beats: [{ target: { type: "page-end" }, transitionMs: 2000 }] },
    }),
    /cannot be combined/,
  );
});
