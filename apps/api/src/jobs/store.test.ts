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

test("gives comparison jobs a useful library title", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deio-comparison-store-"));
  try {
    const store = new JobStore(root);
    await store.initialize();
    const created = await store.create({
      ...request,
      comparison: {
        targetUrl: "https://other.example.com",
        primaryLabel: "Claude",
        secondaryLabel: "GPT",
        layout: "side-by-side",
      },
    });
    assert.equal(created.title, "Claude vs GPT");
    assert.equal(created.request?.comparison?.secondaryLabel, "GPT");
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

test("an enqueue-only API manager hands a job to a separate worker", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scrollizard-worker-"));
  const api = new RecordingJobManager(root, { processJobs: false, pollIntervalMs: 20 });
  const worker = new RecordingJobManager(root, {
    processJobs: true,
    recoverRunning: "requeue",
    pollIntervalMs: 20,
    leaseMs: 500,
    processor: async (recordRequest, outputRoot, jobId, runtime) => {
      if (!jobId || !runtime) throw new Error("Fixture worker requires a managed job");
      const outputDir = path.join(outputRoot, jobId);
      const rawVideoPath = path.join(outputDir, "source.mp4");
      const mp4Path = path.join(outputDir, "output.mp4");
      await fs.mkdir(outputDir, { recursive: true });
      await runtime.onProgress?.({ stage: "capturing", percent: 50, message: "Fixture capture" });
      await fs.writeFile(rawVideoPath, "source");
      await fs.writeFile(mp4Path, "output");
      return {
        jobId,
        outputDir,
        rawVideoPath,
        mp4Path,
        durationMs: 1_000,
        renderTimeMs: 25,
        viewport: recordRequest.videoConfig.viewport,
        scrollStrategy: "document",
      };
    },
  });
  try {
    await api.initialize();
    await worker.initialize();
    const queued = await api.create(request);
    const completed = await api.waitForCompletion(queued.jobId);
    assert.equal(completed.status, "completed");
    assert.equal(completed.result?.sizeBytes, 6);
    assert.equal(completed.workspaceId, "local");
    assert.equal(completed.projectId, "default");
  } finally {
    await worker.shutdown();
    await api.shutdown();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("requeues a running job after its worker lease expires", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scrollizard-lease-"));
  const first = new JobStore(root);
  const replacement = new JobStore(root);
  try {
    await first.initialize();
    const created = await first.create(request);
    assert.ok(await first.claimNextQueued("dead-worker", 5));
    await first.patch(created.jobId, {
      status: "running",
      progress: progress("capturing", 35, "Worker disappeared"),
    });
    first.close();
    await new Promise((resolve) => setTimeout(resolve, 15));

    await replacement.initialize();
    assert.equal(await replacement.recoverExpiredRunningJobs("requeue"), 1);
    const recovered = await replacement.read(created.jobId);
    assert.equal(recovered.status, "queued");
    assert.match(recovered.progress.message, /Recovered/);
  } finally {
    first.close();
    replacement.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("applies opt-in source retention without deleting the final MP4", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scrollizard-retention-"));
  const manager = new RecordingJobManager(root, {
    processJobs: false,
    sourceRetentionDays: 1,
  });
  try {
    await manager.initialize();
    const created = await manager.create(request);
    const outputPath = manager.artifacts.pathFor(created.jobId, "output");
    const sourcePath = manager.artifacts.pathFor(created.jobId, "source");
    await fs.writeFile(outputPath, "output");
    await fs.writeFile(sourcePath, "source");
    await manager.store.patch(created.jobId, {
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      status: "completed",
      progress: progress("completed", 100, "Recording ready"),
      result: {
        videoUrl: `/outputs/${created.jobId}/output.mp4`,
        sourceVideoUrl: `/outputs/${created.jobId}/source.mp4`,
        durationMs: 1_000,
        renderTimeMs: 10,
        sizeBytes: 6,
        viewport: { width: 1280, height: 720 },
        scrollStrategy: "document",
        canRestyle: true,
      },
    });
    await manager.applyRetentionPolicy(new Date("2026-01-03T00:00:00.000Z").getTime());
    assert.equal(await manager.artifacts.inspect(created.jobId, "source"), null);
    assert.ok(await manager.artifacts.inspect(created.jobId, "output"));
    assert.equal((await manager.get(created.jobId)).result?.canRestyle, false);
  } finally {
    await manager.shutdown();
    await fs.rm(root, { recursive: true, force: true });
  }
});
