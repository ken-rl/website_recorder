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
  imageIndex?: number;
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

export type ComparisonSyncMode = "match-progress" | "match-speed" | "independent";

export interface ResponsivenessConfig {
  syncMode?: ComparisonSyncMode;
  desktopLabel?: string;
  mobileLabel?: string;
  desktopWidth?: number;
  desktopHeight?: number;
  mobileWidth?: number;
  mobileHeight?: number;
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
  comparison?: {
    targetUrl: string;
    syncMode?: ComparisonSyncMode;
    primaryLabel: string;
    secondaryLabel: string;
    primaryLogo?: string;
    secondaryLogo?: string;
    primaryLogoDataUrl?: string;
    secondaryLogoDataUrl?: string;
    layout?: "side-by-side";
  };
  responsiveness?: ResponsivenessConfig;
}

export interface RecordingJob {
  schemaVersion: 1;
  jobId: string;
  workspaceId?: string;
  projectId?: string;
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
    comparison?: {
      primaryUrl: string;
      secondaryUrl: string;
      primaryLabel: string;
      secondaryLabel: string;
      layout: "side-by-side";
      primaryLogo?: string;
      secondaryLogo?: string;
      primaryLogoDataUrl?: string;
      secondaryLogoDataUrl?: string;
    };
    responsiveness?: {
      desktopLabel: string;
      mobileLabel: string;
      desktopWidth: number;
      desktopHeight: number;
      mobileWidth: number;
      mobileHeight: number;
    };
  };
  error?: { stage: JobStage; message: string };
  attempt: number;
  parentJobId?: string;
  legacy?: boolean;
}
