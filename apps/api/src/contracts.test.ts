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

test("accepts bounded component interaction direction", () => {
  const request = parseRecordRequest({
    targetUrl: "https://example.com",
    videoConfig: { framerate: 30, viewport: { width: 1280, height: 720 } },
    animationConfig: {
      direction: {
        beats: [{
          target: { type: "selector", selector: "#demo-tab", align: "center" },
          transitionMs: 1500,
          holdMs: 1400,
          interaction: { action: "click", zoomScale: 1.3, showCursor: true },
        }],
      },
    },
  });
  assert.equal(request.animationConfig?.direction?.beats[0].interaction?.action, "click");
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

test("accepts a labeled side-by-side comparison", () => {
  const request = parseRecordRequest({
    targetUrl: "https://alpha.example.com",
    videoConfig: { framerate: 30, viewport: { width: 1920, height: 1080 } },
    animationConfig: { durationMs: 18_000, scrollMode: "auto" },
    comparison: {
      targetUrl: "https://beta.example.com",
      primaryLabel: "Model Alpha",
      secondaryLabel: "Model Beta",
      layout: "side-by-side",
    },
  });

  assert.equal(request.comparison?.targetUrl, "https://beta.example.com");
  assert.equal(request.comparison?.secondaryLabel, "Model Beta");
});

test("rejects unsafe comparison contracts before they reach the worker", () => {
  assert.throws(() => parseRecordRequest({
    targetUrl: "https://alpha.example.com",
    videoConfig: { viewport: { width: 1920, height: 1080 } },
    comparison: {
      targetUrl: "file:///tmp/page.html",
      primaryLabel: "Alpha",
      secondaryLabel: "Beta",
    },
  }), /HTTP/);

  assert.throws(() => parseRecordRequest({
    targetUrl: "https://alpha.example.com",
    videoConfig: { viewport: { width: 1920, height: 1080 } },
    comparison: {
      targetUrl: "https://beta.example.com",
      primaryLabel: "",
      secondaryLabel: "Beta",
    },
  }));
});
