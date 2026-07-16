import fs from "node:fs/promises";
import path from "node:path";

export type ArtifactKind = "output" | "source" | "thumbnail";

export interface StoredArtifact {
  kind: ArtifactKind;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ArtifactStore {
  jobDirectory(jobId: string): string;
  pathFor(jobId: string, kind: ArtifactKind): string;
  inspect(jobId: string, kind: ArtifactKind): Promise<StoredArtifact | null>;
  delete(jobId: string, kind: ArtifactKind): Promise<void>;
  deleteJob(jobId: string): Promise<void>;
}

const FILENAMES: Record<ArtifactKind, string> = {
  output: "output.mp4",
  source: "source.mp4",
  thumbnail: "thumbnail.jpg",
};

export class LocalArtifactStore implements ArtifactStore {
  constructor(readonly root: string) {}

  jobDirectory(jobId: string) {
    validateArtifactJobId(jobId);
    return path.join(this.root, jobId);
  }

  pathFor(jobId: string, kind: ArtifactKind) {
    return path.join(this.jobDirectory(jobId), FILENAMES[kind]);
  }

  async inspect(jobId: string, kind: ArtifactKind): Promise<StoredArtifact | null> {
    const artifactPath = this.pathFor(jobId, kind);
    const details = await fs.stat(artifactPath).catch(() => null);
    if (!details?.isFile()) return null;
    return {
      kind,
      path: artifactPath,
      sizeBytes: details.size,
      createdAt: details.birthtime.toISOString(),
    };
  }

  async delete(jobId: string, kind: ArtifactKind) {
    await fs.rm(this.pathFor(jobId, kind), { force: true });
  }

  async deleteJob(jobId: string) {
    await fs.rm(this.jobDirectory(jobId), { recursive: true, force: true });
  }
}

function validateArtifactJobId(jobId: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(jobId)) throw new Error("Invalid jobId");
}
