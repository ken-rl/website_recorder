export type ScrollMode = "document" | "virtual";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type JobStage = "queued" | "preparing" | "capturing" | "encoding" | "styling" | "finalizing" | "completed" | "failed" | "cancelled" | "interrupted";

export type MotionTarget =
  | { type: "selector"; selector: string; align?: "top" | "center" | "bottom"; offsetPx?: number; fallbackProgress?: number }
  | { type: "progress"; value: number }
  | { type: "page-end" };

export interface WebsiteSection {
  label: string;
  selector: string;
  kind: "heading" | "landmark";
  y: number;
  progress: number;
  height: number;
  targetY: number;
  distanceFromPrevious: number;
  recommendedTransitionMs: number;
  recommendedTarget: Extract<MotionTarget, { type: "selector" }>;
}

export interface WebsiteInspection {
  url: string;
  title: string;
  pageHeight: number;
  viewport: { width: number; height: number };
  scrollMode: ScrollMode;
  safeViewport: { topInsetPx: number; bottomInsetPx: number };
  sections: WebsiteSection[];
  storyboard: Array<{ imageIndex: number; target: { type: "progress"; value: number }; y?: number }>;
  screenshots: string[];
  warnings: string[];
}

export interface DirectorBeat {
  id: string;
  label: string;
  target: MotionTarget;
  progress: number;
  transitionMs: number;
  holdMs: number;
  curve: string;
  imageIndex?: number;
}

export interface RecordingRequest {
  targetUrl: string;
  exportFormat: "mp4";
  videoConfig: {
    framerate: number;
    qualityPreset: string;
    viewport: { width: number; height: number; deviceScaleFactor: number };
  };
  animationConfig: Record<string, unknown>;
  backgroundPreset?: string;
  addShadow?: boolean;
  roundedCorners?: boolean;
}

export interface RecordingJob {
  schemaVersion: 1;
  jobId: string;
  targetUrl: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  progress: { stage: JobStage; percent: number; message: string };
  request?: RecordingRequest;
  result?: {
    videoUrl: string;
    sourceVideoUrl?: string;
    thumbnailUrl?: string;
    durationMs: number;
    renderTimeMs: number;
    sizeBytes: number;
    viewport: { width: number; height: number; deviceScaleFactor?: number };
    scrollStrategy: ScrollMode;
    canRestyle: boolean;
  };
  error?: { stage: JobStage; message: string };
  attempt: number;
  parentJobId?: string;
  legacy?: boolean;
}
