import assert from "node:assert/strict";
import test from "node:test";
import { alignedDocumentPosition, nearestSemanticAnchor } from "./composition.js";

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
    { selector: "#one", label: "One", kind: "heading", y: 800, height: 60, position: 500 },
    { selector: "#two", label: "Two", kind: "heading", y: 1800, height: 60, position: 1500 },
  ], 1420, 900);
  assert.equal(nearest?.selector, "#two");
  assert.equal(nearestSemanticAnchor([], 1420, 900), null);
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
