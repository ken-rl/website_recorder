import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { probeVideoDurationMs, probeVideoSize } from "../transcode/probe.js";
import type {
  RecordRequest,
  RecordingJobManifest,
  RecordingJobProgress,
} from "../types.js";

export const JOB_MANIFEST_FILENAME = "job.json";
export const LOCAL_WORKSPACE_ID = "local";
export const LOCAL_PROJECT_ID = "default";

type RecoveryMode = "interrupt" | "requeue";

interface JobRow {
  manifest_json: string;
}

interface ClaimRow extends JobRow {
  job_id: string;
}

export interface ArtifactRecord {
  kind: "output" | "source" | "thumbnail";
  path: string;
  sizeBytes: number;
  createdAt?: string;
}

export class WorkerLeaseLostError extends Error {
  constructor(jobId: string) {
    super(`Worker lease lost for ${jobId}`);
    this.name = "WorkerLeaseLostError";
  }
}

export class JobStore {
  private database: Database.Database | null = null;

  constructor(readonly outputRoot: string) {}

  async initialize() {
    await fs.mkdir(this.outputRoot, { recursive: true });
    if (!this.database) {
      this.database = new Database(path.join(this.outputRoot, "scrollizard.sqlite3"));
      this.database.pragma("journal_mode = WAL");
      this.database.pragma("foreign_keys = ON");
      this.database.pragma("busy_timeout = 5000");
      this.createSchema();
      this.database.pragma("user_version = 1");
    }
    await this.importFilesystemJobs();
  }

  close() {
    this.database?.close();
    this.database = null;
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
      workspaceId: LOCAL_WORKSPACE_ID,
      projectId: LOCAL_PROJECT_ID,
      targetUrl: request.targetUrl,
      title: new URL(request.targetUrl).hostname.replace(/^www\./, ""),
      createdAt: now,
      updatedAt: now,
      status: "queued",
      progress: progress("queued", 0, "Waiting for a capture worker"),
      request,
      attempt: options?.attempt ?? 1,
      parentJobId: options?.parentJobId,
    };
    await fs.mkdir(this.jobDir(jobId), { recursive: true });
    return this.write(manifest);
  }

  async list() {
    const rows = this.db()
      .prepare("SELECT manifest_json FROM jobs ORDER BY created_at DESC")
      .all() as JobRow[];
    return rows.map(parseManifest);
  }

  async read(jobId: string) {
    validateJobId(jobId);
    const row = this.db()
      .prepare("SELECT manifest_json FROM jobs WHERE job_id = ?")
      .get(jobId) as JobRow | undefined;
    if (!row) throw new Error("Recording job not found");
    return parseManifest(row);
  }

  async write(manifest: RecordingJobManifest) {
    validateJobId(manifest.jobId);
    const next = {
      ...manifest,
      workspaceId: manifest.workspaceId ?? LOCAL_WORKSPACE_ID,
      projectId: manifest.projectId ?? LOCAL_PROJECT_ID,
      updatedAt: new Date().toISOString(),
    } satisfies RecordingJobManifest;
    this.db()
      .prepare(`
        INSERT INTO jobs (
          job_id, workspace_id, project_id, target_url, status,
          created_at, updated_at, manifest_json
        ) VALUES (
          @jobId, @workspaceId, @projectId, @targetUrl, @status,
          @createdAt, @updatedAt, @manifest
        )
        ON CONFLICT(job_id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          project_id = excluded.project_id,
          target_url = excluded.target_url,
          status = excluded.status,
          updated_at = excluded.updated_at,
          manifest_json = excluded.manifest_json
      `)
      .run({
        jobId: next.jobId,
        workspaceId: next.workspaceId,
        projectId: next.projectId,
        targetUrl: next.targetUrl,
        status: next.status,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
        manifest: JSON.stringify(next),
      });
    await this.writeCompatibilityManifest(next);
    return next;
  }

  async patch(jobId: string, update: Partial<RecordingJobManifest>) {
    const current = await this.read(jobId);
    return this.write({ ...current, ...update, jobId: current.jobId, schemaVersion: 1 });
  }

  async patchLeased(
    jobId: string,
    workerId: string,
    update: Partial<RecordingJobManifest>,
  ) {
    validateJobId(jobId);
    const row = this.db().prepare(`
      SELECT manifest_json FROM jobs WHERE job_id = ? AND lease_owner = ?
    `).get(jobId, workerId) as JobRow | undefined;
    if (!row) throw new WorkerLeaseLostError(jobId);
    const current = parseManifest(row);
    const next = {
      ...current,
      ...update,
      jobId: current.jobId,
      schemaVersion: 1 as const,
      workspaceId: current.workspaceId ?? LOCAL_WORKSPACE_ID,
      projectId: current.projectId ?? LOCAL_PROJECT_ID,
      updatedAt: new Date().toISOString(),
    } satisfies RecordingJobManifest;
    const result = this.db().prepare(`
      UPDATE jobs SET
        workspace_id = @workspaceId,
        project_id = @projectId,
        target_url = @targetUrl,
        status = @status,
        updated_at = @updatedAt,
        manifest_json = @manifest
      WHERE job_id = @jobId AND lease_owner = @workerId
    `).run({
      jobId,
      workerId,
      workspaceId: next.workspaceId,
      projectId: next.projectId,
      targetUrl: next.targetUrl,
      status: next.status,
      updatedAt: next.updatedAt,
      manifest: JSON.stringify(next),
    });
    if (result.changes !== 1) throw new WorkerLeaseLostError(jobId);
    await this.writeCompatibilityManifest(next);
    return next;
  }

  async remove(jobId: string) {
    validateJobId(jobId);
    this.db().prepare("DELETE FROM jobs WHERE job_id = ?").run(jobId);
  }

  async claimNextQueued(workerId: string, leaseMs: number) {
    const database = this.db();
    const claim = database.transaction(() => {
      const now = Date.now();
      const row = database.prepare(`
        SELECT job_id, manifest_json
        FROM jobs
        WHERE status = 'queued'
          AND (lease_owner IS NULL OR lease_expires_at < ?)
        ORDER BY created_at ASC
        LIMIT 1
      `).get(now) as ClaimRow | undefined;
      if (!row) return null;
      const result = database.prepare(`
        UPDATE jobs
        SET lease_owner = ?, lease_expires_at = ?, heartbeat_at = ?
        WHERE job_id = ?
          AND status = 'queued'
          AND (lease_owner IS NULL OR lease_expires_at < ?)
      `).run(workerId, now + leaseMs, now, row.job_id, now);
      return result.changes === 1 ? parseManifest(row) : null;
    });
    return claim.immediate();
  }

  async heartbeat(jobId: string, workerId: string, leaseMs: number) {
    const now = Date.now();
    const result = this.db().prepare(`
      UPDATE jobs
      SET heartbeat_at = ?, lease_expires_at = ?
      WHERE job_id = ? AND lease_owner = ?
    `).run(now, now + leaseMs, jobId, workerId);
    return result.changes === 1;
  }

  async releaseLease(jobId: string, workerId: string) {
    this.db().prepare(`
      UPDATE jobs
      SET lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL
      WHERE job_id = ? AND lease_owner = ?
    `).run(jobId, workerId);
  }

  async recoverExpiredRunningJobs(mode: RecoveryMode) {
    const now = Date.now();
    const rows = this.db().prepare(`
      SELECT manifest_json
      FROM jobs
      WHERE status = 'running'
        AND (lease_owner IS NULL OR lease_expires_at < ?)
    `).all(now) as JobRow[];
    for (const row of rows) {
      const job = parseManifest(row);
      const status = mode === "requeue" ? "queued" : "interrupted";
      await this.patch(job.jobId, {
        status,
        progress: progress(
          status,
          mode === "requeue" ? 0 : job.progress.percent,
          mode === "requeue"
            ? "Recovered after worker restart"
            : "Capture interrupted by application restart",
        ),
        error:
          mode === "requeue"
            ? undefined
            : { stage: job.progress.stage, message: "Capture interrupted by application restart" },
      });
      this.db().prepare(`
        UPDATE jobs
        SET lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
            cancel_requested = 0
        WHERE job_id = ?
      `).run(job.jobId);
    }
    return rows.length;
  }

  async requestCancellation(jobId: string) {
    const job = await this.read(jobId);
    if (job.status === "queued") {
      const cancelled = await this.patch(jobId, {
        status: "cancelled",
        progress: progress("cancelled", job.progress.percent, "Capture cancelled"),
      });
      this.db().prepare("UPDATE jobs SET cancel_requested = 0 WHERE job_id = ?").run(jobId);
      return cancelled;
    }
    if (job.status !== "running") {
      throw new Error("Only queued or running jobs can be cancelled");
    }
    this.db().prepare("UPDATE jobs SET cancel_requested = 1 WHERE job_id = ?").run(jobId);
    return this.patch(jobId, {
      progress: progress(job.progress.stage, job.progress.percent, "Cancellation requested"),
    });
  }

  async isCancellationRequested(jobId: string) {
    const row = this.db()
      .prepare("SELECT cancel_requested AS requested FROM jobs WHERE job_id = ?")
      .get(jobId) as { requested: number } | undefined;
    return row?.requested === 1;
  }

  async replaceArtifacts(jobId: string, artifacts: ArtifactRecord[]) {
    validateJobId(jobId);
    const database = this.db();
    database.transaction(() => {
      database.prepare("DELETE FROM artifacts WHERE job_id = ?").run(jobId);
      const insert = database.prepare(`
        INSERT INTO artifacts (job_id, kind, path, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const artifact of artifacts) {
        insert.run(
          jobId,
          artifact.kind,
          artifact.path,
          artifact.sizeBytes,
          artifact.createdAt ?? new Date().toISOString(),
        );
      }
    })();
  }

  async recordUsage(
    jobId: string,
    eventType: string,
    quantity: number,
    unit: string,
  ) {
    this.db().prepare(`
      INSERT INTO usage_events (
        workspace_id, project_id, job_id, event_type, quantity, unit, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      LOCAL_WORKSPACE_ID,
      LOCAL_PROJECT_ID,
      jobId,
      eventType,
      quantity,
      unit,
      new Date().toISOString(),
    );
  }

  jobDir(jobId: string) {
    validateJobId(jobId);
    return path.join(this.outputRoot, jobId);
  }

  private db() {
    if (!this.database) throw new Error("JobStore has not been initialized");
    return this.database;
  }

  private createSchema() {
    this.db().exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        project_id TEXT NOT NULL REFERENCES projects(id),
        target_url TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        heartbeat_at INTEGER,
        cancel_requested INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS jobs_queue_idx
        ON jobs(status, created_at, lease_expires_at);
      CREATE TABLE IF NOT EXISTS artifacts (
        job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(job_id, kind)
      );
      CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        project_id TEXT NOT NULL REFERENCES projects(id),
        job_id TEXT REFERENCES jobs(job_id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    const now = new Date().toISOString();
    this.db()
      .prepare("INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES (?, ?, ?)")
      .run(LOCAL_WORKSPACE_ID, "Local workspace", now);
    this.db()
      .prepare("INSERT OR IGNORE INTO projects (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)")
      .run(LOCAL_PROJECT_ID, LOCAL_WORKSPACE_ID, "Default project", now);
  }

  private async exists(jobId: string) {
    const row = this.db().prepare("SELECT 1 AS found FROM jobs WHERE job_id = ?").get(jobId);
    return Boolean(row);
  }

  private async writeCompatibilityManifest(manifest: RecordingJobManifest) {
    const target = path.join(this.jobDir(manifest.jobId), JOB_MANIFEST_FILENAME);
    const temporary = `${target}.${process.pid}.next`;
    await fs.mkdir(this.jobDir(manifest.jobId), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(manifest, null, 2));
    await fs.rename(temporary, target);
  }

  private async importFilesystemJobs() {
    const entries = await fs.readdir(this.outputRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const jobId = entry.name;
      try {
        validateJobId(jobId);
      } catch {
        continue;
      }
      if (await this.exists(jobId)) continue;

      const manifestPath = path.join(this.jobDir(jobId), JOB_MANIFEST_FILENAME);
      const storedManifest = await fs.readFile(manifestPath, "utf8").catch(() => null);
      if (storedManifest) {
        try {
          await this.write(JSON.parse(storedManifest) as RecordingJobManifest);
          continue;
        } catch {
          // Fall through to importing the completed MP4 as a legacy job.
        }
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
      await this.write({
        schemaVersion: 1,
        jobId,
        workspaceId: LOCAL_WORKSPACE_ID,
        projectId: LOCAL_PROJECT_ID,
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
      });
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

function parseManifest(row: JobRow) {
  return JSON.parse(row.manifest_json) as RecordingJobManifest;
}

function parseLegacyJobName(jobId: string) {
  const match = jobId.match(/^(.*)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-\d+)?$/);
  if (!match) return { host: jobId || undefined, createdAt: undefined };
  return {
    host: match[1],
    createdAt: new Date(match[2].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z")).toISOString(),
  };
}
