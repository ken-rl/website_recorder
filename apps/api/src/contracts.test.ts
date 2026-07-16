import assert from "node:assert/strict";
import test from "node:test";
import { parseRecordRequest } from "./contracts.js";

test("accepts a bounded recording request", () => {
  const request = parseRecordRequest({
    targetUrl: "https://example.com",
    exportFormat: "mp4",
    videoConfig: { framerate: 60, viewport: { width: 1280, height: 720 } },
    animationConfig: { durationMs: 20_000, scrollMode: "document" },
  });
  assert.equal(request.videoConfig.viewport.width, 1280);
});

test("rejects oversized viewports and timelines", () => {
  assert.throws(() => parseRecordRequest({
    targetUrl: "https://example.com",
    videoConfig: { viewport: { width: 10_000, height: 720 } },
  }));
  assert.throws(() => parseRecordRequest({
    targetUrl: "https://example.com",
    videoConfig: { viewport: { width: 1280, height: 720 } },
    animationConfig: {
      direction: {
        startHoldMs: 15_000,
        beats: Array.from({ length: 6 }, () => ({
          target: { type: "page-end" }, transitionMs: 60_000,
        })),
      },
    },
  }), /timeline/);
});
