import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { LocalArtifactStore, type ArtifactStore } from "../artifacts/store.js";
import { processRecordingRequest } from "../pipeline/processRecordingRequest.js";
import type {
  RecordRequest,
  RecordingJobManifest,
} from "../types.js";
import { JobStore, progress, WorkerLeaseLostError } from "./store.js";
import { createVideoThumbnail } from "./thumbnail.js";

type RecordProcessor = typeof processRecordingRequest;

export interface RecordingJobManagerOptions {
  /** The HTTP process sets this false; CLI and MCP keep an embedded worker. */
  processJobs?: boolean;
  workerId?: string;
  pollIntervalMs?: number;
  leaseMs?: number;
  recoverRunning?: "interrupt" | "requeue";
  processor?: RecordProcessor;
  artifactStore?: ArtifactStore;
  sourceRetentionDays?: number;
  outputRetentionDays?: number;
  maxJobRuntimeMs?: number;
  maxOutputBytes?: number;
}

export class RecordingJobManager {
  readonly store: JobStore;
  readonly artifacts: ArtifactStore;
  private readonly events = new EventEmitter();
  private readonly controllers = new Map<string, AbortController>();
  private readonly processJobs: boolean;
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly leaseMs: number;
  private readonly recoverRunning: "interrupt" | "requeue";
  private readonly processor: RecordProcessor;
  private readonly sourceRetentionDays: number;
  private readonly outputRetentionDays: number;
  private readonly maxJobRuntimeMs: number;
  private readonly maxOutputBytes: number;
  private activeJobId: string | null = null;
  private draining = false;
  private shuttingDown = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(readonly outputRoot: string, options: RecordingJobManagerOptions = {}) {
    this.store = new JobStore(outputRoot);
    this.artifacts = options.artifactStore ?? new LocalArtifactStore(outputRoot);
    this.processJobs = options.processJobs ?? true;
    this.workerId = options.workerId ?? `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.pollIntervalMs = options.pollIntervalMs ?? 750;
    this.leaseMs = options.leaseMs ?? 15_000;
    this.recoverRunning = options.recoverRunning ?? "interrupt";
    this.processor = options.processor ?? processRecordingRequest;
    this.sourceRetentionDays = options.sourceRetentionDays ?? envDays("SOURCE_RETENTION_DAYS");
    this.outputRetentionDays = options.outputRetentionDays ?? envDays("OUTPUT_RETENTION_DAYS");
    this.maxJobRuntimeMs = options.maxJobRuntimeMs ?? envPositiveNumber("MAX_JOB_RUNTIME_MS", 900_000);
    this.maxOutputBytes = options.maxOutputBytes ?? envPositiveNumber("MAX_OUTPUT_BYTES", 1_073_741_824);
    this.events.setMaxListeners(100);
  }

  async initialize() {
    await this.store.initialize();
    if (!this.processJobs) return;
    await this.store.recoverExpiredRunningJobs(this.recoverRunning);
    await this.applyRetentionPolicy();
    this.pollTimer = setInterval(() => void this.drain(), this.pollIntervalMs);
    this.pollTimer.unref?.();
    void this.drain();
  }

  async shutdown() {
    this.shuttingDown = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    for (const controller of this.controllers.values()) {
      controller.abort(new Error("Capture worker shutting down"));
    }
    while (this.draining) await new Promise((resolve) => setTimeout(resolve, 25));
    this.store.close();
  }

  async create(request: RecordRequest, options?: { parentJobId?: string; attempt?: number }) {
    const job = await this.store.create(request, options);
    this.emit(job);
    if (this.processJobs) void this.drain();
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
    let lastUpdatedAt = "";
    const poll = setInterval(() => {
      void this.get(jobId)
        .then((job) => {
          if (job.updatedAt === lastUpdatedAt) return;
          lastUpdatedAt = job.updatedAt;
          listener(job);
        })
        .catch(() => undefined);
    }, this.pollIntervalMs);
    return () => {
      clearInterval(poll);
      this.events.off(key, listener);
    };
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
    const job = await this.store.requestCancellation(jobId);
    this.controllers.get(jobId)?.abort(new Error("Capture cancelled"));
    this.emit(job);
    return job;
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
    await this.artifacts.deleteJob(jobId);
    await this.store.remove(jobId);
  }

  async refreshResult(jobId: string, request?: RecordRequest) {
    const job = await this.store.read(jobId);
    if (!job.result) return job;
    const outputPath = this.artifacts.pathFor(jobId, "output");
    const thumbnailPath = this.artifacts.pathFor(jobId, "thumbnail");
    await createVideoThumbnail(outputPath, thumbnailPath).catch(() => undefined);
    const [output, source, thumbnail] = await Promise.all([
      this.artifacts.inspect(jobId, "output"),
      this.artifacts.inspect(jobId, "source"),
      this.artifacts.inspect(jobId, "thumbnail"),
    ]);
    if (!output) throw new Error("Recording output is missing");
    await this.store.replaceArtifacts(
      jobId,
      [output, source, thumbnail].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    );
    return this.update(jobId, {
      request: request ?? job.request,
      result: {
        ...job.result,
        sizeBytes: output.sizeBytes,
        thumbnailUrl: thumbnail ? `/outputs/${jobId}/thumbnail.jpg` : job.result.thumbnailUrl,
        canRestyle: Boolean(source),
      },
    });
  }

  async applyRetentionPolicy(now = Date.now()) {
    const jobs = await this.store.list();
    const sourceCutoff = cutoff(now, this.sourceRetentionDays);
    const outputCutoff = cutoff(now, this.outputRetentionDays);
    for (const job of jobs) {
      if (job.status !== "completed") continue;
      const createdAt = new Date(job.createdAt).getTime();
      if (outputCutoff && createdAt < outputCutoff) {
        await this.artifacts.deleteJob(job.jobId);
        await this.store.remove(job.jobId);
        continue;
      }
      if (sourceCutoff && createdAt < sourceCutoff && job.result?.sourceVideoUrl) {
        await this.artifacts.delete(job.jobId, "source");
        const updated = await this.update(job.jobId, {
          result: { ...job.result, sourceVideoUrl: undefined, canRestyle: false },
        });
        const [output, thumbnail] = await Promise.all([
          this.artifacts.inspect(updated.jobId, "output"),
          this.artifacts.inspect(updated.jobId, "thumbnail"),
        ]);
        await this.store.replaceArtifacts(
          updated.jobId,
          [output, thumbnail].filter((item): item is NonNullable<typeof item> => Boolean(item)),
        );
      }
    }
  }

  private async drain() {
    if (!this.processJobs || this.draining) return;
    this.draining = true;
    try {
      // A replacement worker may start before the previous lease expires.
      // Re-check on every poll so those jobs become runnable once the lease is stale.
      if (!this.activeJobId) {
        await this.store.recoverExpiredRunningJobs(this.recoverRunning);
      }
      while (!this.activeJobId) {
        const job = await this.store.claimNextQueued(this.workerId, this.leaseMs);
        if (!job?.request) break;
        this.activeJobId = job.jobId;
        try {
          await this.run(job);
        } finally {
          await this.store.releaseLease(job.jobId, this.workerId);
          this.activeJobId = null;
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async run(job: RecordingJobManifest) {
    if (!job.request) return;
    const controller = new AbortController();
    this.controllers.set(job.jobId, controller);
    let timedOut = false;
    let leaseLost = false;
    const runtimeLimitMs = (job.request.comparison || job.request.responsiveness)
      ? this.maxJobRuntimeMs * 2
      : this.maxJobRuntimeMs;
    const runtimeTimeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`Capture exceeded ${runtimeLimitMs}ms runtime limit`));
    }, runtimeLimitMs);
    let lastWriteAt = 0;
    let lastPercent = -1;
    const heartbeat = setInterval(() => {
      void Promise.all([
        this.store.heartbeat(job.jobId, this.workerId, this.leaseMs),
        this.store.isCancellationRequested(job.jobId),
      ]).then(([leaseRenewed, cancelRequested]) => {
        if (!leaseRenewed && !controller.signal.aborted) {
          leaseLost = true;
          controller.abort(new WorkerLeaseLostError(job.jobId));
          return;
        }
        if (cancelRequested && !controller.signal.aborted) {
          controller.abort(new Error("Capture cancelled"));
        }
      });
    }, Math.max(1_000, Math.floor(this.leaseMs / 3)));
    await this.updateLeased(job.jobId, {
      status: "running",
      error: undefined,
      progress: progress("preparing", 1, "Starting capture"),
    });
    try {
      const result = await this.processor(job.request, this.outputRoot, job.jobId, {
        signal: controller.signal,
        onProgress: async (event) => {
          const now = Date.now();
          const rounded = Math.round(event.percent);
          if (rounded === lastPercent && now - lastWriteAt < 500) return;
          if (now - lastWriteAt < 250 && rounded < lastPercent + 2) return;
          lastWriteAt = now;
          lastPercent = rounded;
          await this.updateLeased(job.jobId, {
            status: "running",
            progress: progress(event.stage, event.percent, event.message),
          });
        },
      });
      controller.signal.throwIfAborted();
      const thumbnailPath = this.artifacts.pathFor(job.jobId, "thumbnail");
      await this.updateLeased(job.jobId, {
        status: "running",
        progress: progress("finalizing", 98, "Generating library thumbnail"),
      });
      await createVideoThumbnail(result.mp4Path, thumbnailPath, controller.signal).catch(() => undefined);
      const [output, source, thumbnail] = await Promise.all([
        this.artifacts.inspect(job.jobId, "output"),
        this.artifacts.inspect(job.jobId, "source"),
        this.artifacts.inspect(job.jobId, "thumbnail"),
      ]);
      if (!output) throw new Error("Capture completed without an output artifact");
      if (output.sizeBytes > this.maxOutputBytes) {
        await this.artifacts.deleteJob(job.jobId);
        throw new Error(`Capture exceeded ${this.maxOutputBytes} byte output limit`);
      }
      await this.store.replaceArtifacts(
        job.jobId,
        [output, source, thumbnail].filter((item): item is NonNullable<typeof item> => Boolean(item)),
      );
      await Promise.all([
        this.store.recordUsage(job.jobId, "render_time", result.renderTimeMs, "milliseconds"),
        this.store.recordUsage(job.jobId, "output_size", output.sizeBytes, "bytes"),
        this.store.recordUsage(job.jobId, "video_duration", result.durationMs, "milliseconds"),
      ]);
      await this.updateLeased(job.jobId, {
        status: "completed",
        progress: progress("completed", 100, "Recording ready"),
        result: {
          videoUrl: `/outputs/${job.jobId}/output.mp4`,
          sourceVideoUrl: source ? `/outputs/${job.jobId}/source.mp4` : undefined,
          thumbnailUrl: thumbnail ? `/outputs/${job.jobId}/thumbnail.jpg` : undefined,
          durationMs: result.durationMs,
          renderTimeMs: result.renderTimeMs,
          sizeBytes: output.sizeBytes,
          viewport: result.viewport,
          scrollStrategy: result.scrollStrategy,
          motionPlan: result.motionPlan,
          canRestyle: Boolean(source),
          comparison: job.request.comparison ? {
            primaryUrl: job.request.targetUrl,
            secondaryUrl: job.request.comparison.targetUrl,
            primaryLabel: job.request.comparison.primaryLabel,
            secondaryLabel: job.request.comparison.secondaryLabel,
            layout: job.request.comparison.layout ?? "side-by-side",
            primaryLogo: job.request.comparison.primaryLogo,
            secondaryLogo: job.request.comparison.secondaryLogo,
            primaryLogoDataUrl: job.request.comparison.primaryLogoDataUrl,
            secondaryLogoDataUrl: job.request.comparison.secondaryLogoDataUrl,
          } : undefined,
          responsiveness: job.request.responsiveness ? {
            desktopLabel: job.request.responsiveness.desktopLabel || "Desktop View",
            mobileLabel: job.request.responsiveness.mobileLabel || "Mobile View",
            desktopWidth: job.request.videoConfig.viewport.width,
            desktopHeight: job.request.videoConfig.viewport.height,
            mobileWidth: job.request.responsiveness.mobileWidth || 390,
            mobileHeight: job.request.responsiveness.mobileHeight || 844,
          } : undefined,
        },
      });
    } catch (error) {
      if (leaseLost || error instanceof WorkerLeaseLostError) return;
      const message = error instanceof Error ? error.message : "Unknown capture failure";
      const current = await this.store.read(job.jobId);
      const requeue = this.shuttingDown;
      const cancelled = !timedOut && !requeue && (
        controller.signal.aborted || (await this.store.isCancellationRequested(job.jobId))
      );
      await this.updateLeased(job.jobId, {
        status: requeue ? "queued" : cancelled ? "cancelled" : "failed",
        progress: progress(
          requeue ? "queued" : cancelled ? "cancelled" : "failed",
          requeue ? 0 : current.progress.percent,
          requeue ? "Worker stopped; waiting to retry" : cancelled ? "Capture cancelled" : message,
        ),
        error: requeue ? undefined : { stage: current.progress.stage, message },
      });
    } finally {
      clearTimeout(runtimeTimeout);
      clearInterval(heartbeat);
      this.controllers.delete(job.jobId);
    }
  }

  private async update(jobId: string, patch: Partial<RecordingJobManifest>) {
    const job = await this.store.patch(jobId, patch);
    this.emit(job);
    return job;
  }

  private async updateLeased(jobId: string, patch: Partial<RecordingJobManifest>) {
    const job = await this.store.patchLeased(jobId, this.workerId, patch);
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

function envDays(name: string) {
  const value = Number(process.env[name] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function envPositiveNumber(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function cutoff(now: number, retentionDays: number) {
  return retentionDays > 0 ? now - retentionDays * 86_400_000 : 0;
}
