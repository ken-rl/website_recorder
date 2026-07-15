import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RecordingJobManager } from "./manager.js";
import { JobStore, progress, validateJobId } from "./store.js";
import type { RecordRequest } from "../types.js";

const request: RecordRequest = {
  targetUrl: "https://example.com",
  exportFormat: "mp4",
  videoConfig: { viewport: { width: 1280, height: 720 } },
};

test("writes and patches an atomic job manifest", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scrollizard-store-"));
  try {
    const store = new JobStore(root);
    await store.initialize();
    const created = await store.create(request);
    assert.equal(created.status, "queued");
    assert.equal(created.request?.targetUrl, request.targetUrl);

    const updated = await store.patch(created.jobId, {
      status: "running",
      progress: progress("capturing", 42.4, "Capturing frame 42"),
    });
    assert.equal(updated.progress.percent, 42);
    assert.equal((await store.read(created.jobId)).status, "running");
    await assert.rejects(fs.access(path.join(root, created.jobId, "job.json.next")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("marks an in-flight job interrupted on manager startup", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scrollizard-recovery-"));
  try {
    const store = new JobStore(root);
    await store.initialize();
    const created = await store.create(request);
    await store.patch(created.jobId, {
      status: "running",
      progress: progress("encoding", 81, "Encoding"),
    });

    const manager = new RecordingJobManager(root);
    await manager.initialize();
    const recovered = await manager.get(created.jobId);
    assert.equal(recovered.status, "interrupted");
    assert.equal(recovered.error?.stage, "encoding");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("accepts generated host job IDs and rejects path traversal", () => {
  assert.doesNotThrow(() => validateJobId("example.com-2026-07-15T01-02-03-000Z"));
  assert.throws(() => validateJobId("../outputs"), /Invalid jobId/);
  assert.throws(() => validateJobId("a/b"), /Invalid jobId/);
});
