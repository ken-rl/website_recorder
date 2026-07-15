import fs from "node:fs/promises";
import path from "node:path";
import { probeVideoDurationMs, probeVideoSize } from "../transcode/probe.js";
import type {
  RecordRequest,
  RecordingJobManifest,
  RecordingJobProgress,
} from "../types.js";

export const JOB_MANIFEST_FILENAME = "job.json";

export class JobStore {
  constructor(readonly outputRoot: string) {}

  async initialize() {
    await fs.mkdir(this.outputRoot, { recursive: true });
    await this.importLegacyOutputs();
  }

  createJobId(targetUrl: string) {
    const host = new URL(targetUrl).hostname.replace(/^www\./, "");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${host}-${stamp}`;
  }

  async create(
    request: RecordRequest,
    options?: { parentJobId?: string; attempt?: number },
  ) {
    const now = new Date().toISOString();
    let jobId = this.createJobId(request.targetUrl);
    let suffix = 1;
    while (await this.exists(jobId)) jobId = `${this.createJobId(request.targetUrl)}-${suffix++}`;
    const manifest: RecordingJobManifest = {
      schemaVersion: 1,
      jobId,
      targetUrl: request.targetUrl,
      title: new URL(request.targetUrl).hostname.replace(/^www\./, ""),
      createdAt: now,
      updatedAt: now,
      status: "queued",
      progress: progress("queued", 0, "Waiting for the capture worker"),
      request,
      attempt: options?.attempt ?? 1,
      parentJobId: options?.parentJobId,
    };
    await fs.mkdir(this.jobDir(jobId), { recursive: true });
    await this.write(manifest);
    return manifest;
  }

  async list() {
    const entries = await fs.readdir(this.outputRoot, { withFileTypes: true }).catch(() => []);
    const jobs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => this.read(entry.name).catch(() => null)),
    );
    return jobs
      .filter((job): job is RecordingJobManifest => Boolean(job))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async read(jobId: string) {
    validateJobId(jobId);
    const raw = await fs.readFile(this.manifestPath(jobId), "utf8");
    return JSON.parse(raw) as RecordingJobManifest;
  }

  async write(manifest: RecordingJobManifest) {
    validateJobId(manifest.jobId);
    const next = {
      ...manifest,
      updatedAt: new Date().toISOString(),
    } satisfies RecordingJobManifest;
    const target = this.manifestPath(manifest.jobId);
    const temporary = `${target}.next`;
    await fs.mkdir(this.jobDir(manifest.jobId), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(next, null, 2));
    await fs.rename(temporary, target);
    return next;
  }

  async patch(jobId: string, update: Partial<RecordingJobManifest>) {
    const current = await this.read(jobId);
    return this.write({ ...current, ...update, jobId: current.jobId, schemaVersion: 1 });
  }

  async remove(jobId: string) {
    validateJobId(jobId);
    await fs.rm(this.jobDir(jobId), { recursive: true, force: true });
  }

  jobDir(jobId: string) {
    validateJobId(jobId);
    return path.join(this.outputRoot, jobId);
  }

  private manifestPath(jobId: string) {
    return path.join(this.jobDir(jobId), JOB_MANIFEST_FILENAME);
  }

  private async exists(jobId: string) {
    return fs.access(this.jobDir(jobId)).then(() => true).catch(() => false);
  }

  private async importLegacyOutputs() {
    const entries = await fs.readdir(this.outputRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const jobId = entry.name;
      try {
        validateJobId(jobId);
        await fs.access(this.manifestPath(jobId));
        continue;
      } catch (error) {
        if (error instanceof Error && error.message === "Invalid jobId") continue;
      }
      const outputPath = path.join(this.jobDir(jobId), "output.mp4");
      const details = await fs.stat(outputPath).catch(() => null);
      if (!details?.isFile()) continue;
      const [durationMs, viewport, source] = await Promise.all([
        probeVideoDurationMs(outputPath),
        probeVideoSize(outputPath),
        fs.stat(path.join(this.jobDir(jobId), "source.mp4")).catch(() => null),
      ]);
      const parsed = parseLegacyJobName(jobId);
      const createdAt = parsed.createdAt ?? details.birthtime.toISOString();
      const manifest: RecordingJobManifest = {
        schemaVersion: 1,
        jobId,
        targetUrl: parsed.host ? `https://${parsed.host}` : "",
        createdAt,
        updatedAt: new Date().toISOString(),
        status: "completed",
        progress: progress("completed", 100, "Legacy recording imported"),
        result: {
          videoUrl: `/outputs/${jobId}/output.mp4`,
          sourceVideoUrl: source?.isFile() ? `/outputs/${jobId}/source.mp4` : undefined,
          durationMs: durationMs ?? 0,
          renderTimeMs: 0,
          sizeBytes: details.size,
          viewport: {
            width: viewport?.width ?? 0,
            height: viewport?.height ?? 0,
            deviceScaleFactor: 1,
          },
          scrollStrategy: "document",
          canRestyle: Boolean(source?.isFile()),
        },
        attempt: 1,
        legacy: true,
      };
      await this.write(manifest);
    }
  }
}

export function progress(
  stage: RecordingJobProgress["stage"],
  percent: number,
  message: string,
): RecordingJobProgress {
  return { stage, percent: Math.max(0, Math.min(100, Math.round(percent))), message };
}

export function validateJobId(jobId: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(jobId)) throw new Error("Invalid jobId");
}

function parseLegacyJobName(jobId: string) {
  const match = jobId.match(/^(.*)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-\d+)?$/);
  if (!match) return { host: jobId || undefined, createdAt: undefined };
  return {
    host: match[1],
    createdAt: new Date(match[2].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z")).toISOString(),
  };
}
