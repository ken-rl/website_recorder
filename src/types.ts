export interface ViewportConfig {
  width: number
  height: number
  deviceScaleFactor?: number
}

export interface PauseTrigger {
  selector: string
  durationMs: number
}

export interface VideoConfig {
  framerate?: number
  qualityPreset?: 'high' | 'medium' | 'low'
  viewport: ViewportConfig
}

export interface AnimationConfig {
  pixelsPerFrame?: number
  preRecordingDelayMs?: number
  removeOverlayElements?: boolean
  pauseTriggers?: PauseTrigger[]
}

export interface RecordRequest {
  targetUrl: string
  exportFormat?: 'mp4'
  videoConfig: VideoConfig
  animationConfig?: AnimationConfig
}

export interface RecordResult {
  jobId: string
  outputDir: string
  rawVideoPath: string
  mp4Path: string
  durationMs: number
  viewport: ViewportConfig
}
