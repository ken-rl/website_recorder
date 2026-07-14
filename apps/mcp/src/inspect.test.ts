import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInspectionSections, type RawWebsiteSection } from "./inspect.js";

test("centers heading targets inside the safe viewport", () => {
  const raw: RawWebsiteSection[] = [{
    label: "Features",
    selector: "#features-heading",
    kind: "heading",
    y: 1200,
    height: 80,
    stable: 1,
  }];
  const [section] = normalizeInspectionSections(
    raw,
    { topInsetPx: 72, bottomInsetPx: 24 },
    900,
    5000,
  );
  assert.deepEqual(section.recommendedTarget, {
    type: "selector",
    selector: "#features-heading",
    align: "center",
  });
  assert.equal(section.targetY, 754);
});

test("top-aligns landmarks without a heading below sticky navigation", () => {
  const raw: RawWebsiteSection[] = [{
    label: "Gallery",
    selector: "#gallery",
    kind: "landmark",
    y: 1600,
    height: 1200,
    stable: 1,
  }];
  const [section] = normalizeInspectionSections(
    raw,
    { topInsetPx: 72, bottomInsetPx: 24 },
    900,
    5000,
  );
  assert.equal(section.recommendedTarget.align, "top");
  assert.equal(section.targetY, 1504);
});
