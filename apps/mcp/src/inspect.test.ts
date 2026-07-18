import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInspectionSections, type RawWebsiteSection } from "./inspect.js";

test("frames heading targets in the upper content area", () => {
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
    align: "top",
    offsetPx: -109,
  });
  assert.equal(section.targetY, 995);
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

test("combines headings that share one visual row", () => {
  const sections = normalizeInspectionSections(
    [
      {
        label: "Performance",
        selector: "#performance",
        kind: "heading",
        y: 1800,
        height: 32,
        stable: 1,
      },
      {
        label: "CMS",
        selector: "#cms",
        kind: "heading",
        y: 1800,
        height: 32,
        stable: 1,
      },
    ],
    { topInsetPx: 64, bottomInsetPx: 24 },
    900,
    5000,
  );

  assert.equal(sections.length, 1);
  assert.equal(sections[0].label, "Performance · CMS");
});
