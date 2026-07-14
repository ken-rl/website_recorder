import assert from "node:assert/strict";
import test from "node:test";
import { alignedDocumentPosition, nearestSemanticAnchor, resolvePauseFraming } from "./composition.js";

test("top alignment clears a sticky header and composition margin", () => {
  assert.equal(alignedDocumentPosition({
    y: 1000,
    height: 80,
    align: "top",
    offsetPx: 0,
    safeViewport: { topInsetPx: 72, bottomInsetPx: 24 },
    viewportHeight: 900,
    maxScroll: 5000,
  }), 904);
});

test("finds a semantic section near a held progress position", () => {
  const nearest = nearestSemanticAnchor([
    { selector: "#one", label: "One", kind: "heading", y: 800, height: 60, position: 500, recommendedAlign: "center" },
    { selector: "#two", label: "Two", kind: "heading", y: 1800, height: 60, position: 1500, recommendedAlign: "center" },
  ], 1420, 900);
  assert.equal(nearest?.selector, "#two");
  assert.equal(nearestSemanticAnchor([], 1420, 900), null);
});

test("corrects a held heading hidden behind a sticky header", () => {
  const framing = resolvePauseFraming({
    y: 1000,
    height: 80,
    position: 950,
    align: "center",
    safeViewport: { topInsetPx: 72, bottomInsetPx: 24 },
    viewportHeight: 900,
    maxScroll: 5000,
  });
  assert.equal(framing.targetY, 904);
  assert.equal(framing.safeTopPx, 96);
  assert.equal(framing.verified, true);
});

test("top-frames a landmark that is taller than the safe viewport", () => {
  const framing = resolvePauseFraming({
    y: 1200,
    height: 1200,
    position: 1500,
    align: "center",
    safeViewport: { topInsetPx: 72, bottomInsetPx: 24 },
    viewportHeight: 900,
    maxScroll: 5000,
  });
  assert.equal(framing.targetY, 1104);
  assert.equal(framing.align, "top");
  assert.equal(framing.verified, true);
});

test("center alignment uses the unobstructed viewport", () => {
  assert.equal(alignedDocumentPosition({
    y: 1000,
    height: 100,
    align: "center",
    offsetPx: 0,
    safeViewport: { topInsetPx: 72, bottomInsetPx: 24 },
    viewportHeight: 900,
    maxScroll: 5000,
  }), 564);
});
