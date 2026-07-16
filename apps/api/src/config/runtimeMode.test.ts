import assert from "node:assert/strict";
import test from "node:test";
import { embeddedWorkerEnabled } from "./runtimeMode.js";

test("runs an embedded capture worker by default for local startup", () => {
  assert.equal(embeddedWorkerEnabled({}), true);
  assert.equal(embeddedWorkerEnabled({ EMBEDDED_WORKER: "1" }), true);
});

test("allows hosted deployments to opt into an external worker", () => {
  assert.equal(embeddedWorkerEnabled({ EMBEDDED_WORKER: "0" }), false);
});
