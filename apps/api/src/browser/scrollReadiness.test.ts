import assert from "node:assert/strict";
import test from "node:test";
import {
  isPotentialScrollLock,
  isTransientScrollLock,
} from "./scrollReadiness.js";

test("detects a tall document hidden behind a temporary intro lock", () => {
  assert.equal(isTransientScrollLock({
    viewportHeight: 720,
    documentScrollRange: 0,
    latentContentHeight: 16_880,
    bodyLocked: true,
    htmlLocked: false,
  }), true);
});

test("does not delay normal documents and observes provisional one-screen pages", () => {
  assert.equal(isTransientScrollLock({
    viewportHeight: 720,
    documentScrollRange: 5_000,
    latentContentHeight: 5_720,
    bodyLocked: false,
    htmlLocked: false,
  }), false);
  assert.equal(isTransientScrollLock({
    viewportHeight: 720,
    documentScrollRange: 0,
    latentContentHeight: 720,
    bodyLocked: true,
    htmlLocked: true,
  }), false);
  assert.equal(isPotentialScrollLock({
    viewportHeight: 720,
    documentScrollRange: 0,
    latentContentHeight: 720,
    bodyLocked: true,
    htmlLocked: true,
  }), true);
});
