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
