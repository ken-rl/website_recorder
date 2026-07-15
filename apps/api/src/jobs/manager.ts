import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { recordWebsite } from "../pipeline/recordWebsite.js";
import type {
  RecordRequest,
  RecordingJobManifest,
  RecordingJobProgress,
} from "../types.js";
import { JobStore, progress } from "./store.js";
import { createVideoThumbnail } from "./thumbnail.js";

export class RecordingJobManager {
  readonly store: JobStore;
  private readonly events = new EventEmitter();
  private readonly queue: string[] = [];
  private readonly controllers = new Map<string, AbortController>();
  private activeJobId: string | null = null;
  private draining = false;

  constructor(outputRoot: string) {
    this.store = new JobStore(outputRoot);
    this.events.setMaxListeners(100);
  }

  async initialize() {
    await this.store.initialize();
    for (const job of await this.store.list()) {
      if (job.status === "running") {
        await this.update(job.jobId, {
          status: "interrupted",
          progress: progress("interrupted", job.progress.percent, "Capture interrupted by application restart"),
          error: { stage: job.progress.stage, message: "Capture interrupted by application restart" },
        });
      } else if (job.status === "queued") {
        this.queue.push(job.jobId);
      }
    }
    void this.drain();
  }

  async create(request: RecordRequest, options?: { parentJobId?: string; attempt?: number }) {
    const job = await this.store.create(request, options);
    this.queue.push(job.jobId);
    this.emit(job);
    void this.drain();
    return job;
  }

  async get(jobId: string) {
    return this.store.read(jobId);
  }

  async list() {
    return this.store.list();
  }

  subscribe(jobId: string, listener: (job: RecordingJobManifest) => void) {
    const key = `job:${jobId}`;
    this.events.on(key, listener);
    return () => this.events.off(key, listener);
  }

  async waitForCompletion(jobId: string) {
    return new Promise<RecordingJobManifest>((resolve, reject) => {
      let settled = false;
      const finish = (job: RecordingJobManifest) => {
        if (settled || !isTerminal(job.status)) return;
        settled = true;
        unsubscribe();
        resolve(job);
      };
      const unsubscribe = this.subscribe(jobId, finish);
      void this.get(jobId).then(finish).catch((error) => {
        unsubscribe();
        reject(error);
      });
    });
  }

  async cancel(jobId: string) {
    const job = await this.store.read(jobId);
    if (job.status === "queued") {
      const index = this.queue.indexOf(jobId);
      if (index >= 0) this.queue.splice(index, 1);
      return this.update(jobId, {
        status: "cancelled",
        progress: progress("cancelled", job.progress.percent, "Capture cancelled"),
      });
    }
    if (job.status !== "running") throw new Error("Only queued or running jobs can be cancelled");
    this.controllers.get(jobId)?.abort(new Error("Capture cancelled"));
    return this.store.read(jobId);
  }

  async retry(jobId: string) {
    const job = await this.store.read(jobId);
    if (!job.request) throw new Error("This recording has no saved request to retry");
    if (job.status === "queued" || job.status === "running") {
      throw new Error("A running or queued job cannot be retried");
    }
    return this.create(job.request, { parentJobId: job.jobId, attempt: job.attempt + 1 });
  }

  async remove(jobId: string) {
    const job = await this.store.read(jobId);
    if (job.status === "queued" || job.status === "running") {
      throw new Error("Cancel this recording before deleting it");
    }
    await this.store.remove(jobId);
  }

  async refreshResult(jobId: string, request?: RecordRequest) {
    const job = await this.store.read(jobId);
    if (!job.result) return job;
    const outputPath = path.join(this.store.jobDir(jobId), "output.mp4");
    const sourcePath = path.join(this.store.jobDir(jobId), "source.mp4");
    const thumbnailPath = path.join(this.store.jobDir(jobId), "thumbnail.jpg");
    await createVideoThumbnail(outputPath, thumbnailPath).catch(() => undefined);
    const [output, source, thumbnail] = await Promise.all([
      fs.stat(outputPath),
      fs.stat(sourcePath).catch(() => null),
      fs.stat(thumbnailPath).catch(() => null),
    ]);
    return this.update(jobId, {
      request: request ?? job.request,
      result: {
        ...job.result,
        sizeBytes: output.size,
        thumbnailUrl: thumbnail?.isFile() ? `/outputs/${jobId}/thumbnail.jpg` : job.result.thumbnailUrl,
        canRestyle: Boolean(source?.isFile()),
      },
    });
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.activeJobId && this.queue.length > 0) {
        const jobId = this.queue.shift();
        if (!jobId) continue;
        const job = await this.store.read(jobId).catch(() => null);
        if (!job || job.status !== "queued" || !job.request) continue;
        this.activeJobId = jobId;
        await this.run(job);
        this.activeJobId = null;
      }
    } finally {
      this.draining = false;
      if (!this.activeJobId && this.queue.length > 0) void this.drain();
    }
  }

  private async run(job: RecordingJobManifest) {
    if (!job.request) return;
    const controller = new AbortController();
    this.controllers.set(job.jobId, controller);
    let lastWriteAt = 0;
    let lastPercent = -1;
    await this.update(job.jobId, {
      status: "running",
      error: undefined,
      progress: progress("preparing", 1, "Starting capture"),
    });
    try {
      const result = await recordWebsite(job.request, this.store.outputRoot, job.jobId, {
        signal: controller.signal,
        onProgress: async (event) => {
          const now = Date.now();
          const rounded = Math.round(event.percent);
          if (rounded === lastPercent && now - lastWriteAt < 500) return;
          if (now - lastWriteAt < 250 && rounded < lastPercent + 2) return;
          lastWriteAt = now;
          lastPercent = rounded;
          await this.update(job.jobId, {
            status: "running",
            progress: progress(event.stage, event.percent, event.message),
          });
        },
      });
      controller.signal.throwIfAborted();
      const thumbnailPath = path.join(result.outputDir, "thumbnail.jpg");
      await this.update(job.jobId, {
        status: "running",
        progress: progress("finalizing", 98, "Generating library thumbnail"),
      });
      await createVideoThumbnail(result.mp4Path, thumbnailPath, controller.signal).catch(() => undefined);
      const [output, source, thumbnail] = await Promise.all([
        fs.stat(result.mp4Path),
        fs.stat(result.rawVideoPath).catch(() => null),
        fs.stat(thumbnailPath).catch(() => null),
      ]);
      await this.update(job.jobId, {
        status: "completed",
        progress: progress("completed", 100, "Recording ready"),
        result: {
          videoUrl: `/outputs/${job.jobId}/output.mp4`,
          sourceVideoUrl: source?.isFile() ? `/outputs/${job.jobId}/source.mp4` : undefined,
          thumbnailUrl: thumbnail?.isFile() ? `/outputs/${job.jobId}/thumbnail.jpg` : undefined,
          durationMs: result.durationMs,
          renderTimeMs: result.renderTimeMs,
          sizeBytes: output.size,
          viewport: result.viewport,
          scrollStrategy: result.scrollStrategy,
          motionPlan: result.motionPlan,
          canRestyle: Boolean(source?.isFile()),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown capture failure";
      const current = await this.store.read(job.jobId);
      const cancelled = controller.signal.aborted;
      await this.update(job.jobId, {
        status: cancelled ? "cancelled" : "failed",
        progress: progress(
          cancelled ? "cancelled" : "failed",
          current.progress.percent,
          cancelled ? "Capture cancelled" : message,
        ),
        error: { stage: current.progress.stage, message },
      });
    } finally {
      this.controllers.delete(job.jobId);
    }
  }

  private async update(jobId: string, patch: Partial<RecordingJobManifest>) {
    const job = await this.store.patch(jobId, patch);
    this.emit(job);
    return job;
  }

  private emit(job: RecordingJobManifest) {
    this.events.emit(`job:${job.jobId}`, job);
    this.events.emit("jobs", job);
  }
}

function isTerminal(status: RecordingJobManifest["status"]) {
  return ["completed", "failed", "cancelled", "interrupted"].includes(status);
}
