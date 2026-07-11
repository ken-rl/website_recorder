export type QualityPreset = 'high' | 'medium' | 'low'

export interface EncodeSettings {
  crf: number
  preset: string
  deviceScaleFactor: number
}

export function resolveEncodeSettings(
  qualityPreset: QualityPreset = 'high',
  requestedScaleFactor?: number,
): EncodeSettings {
  const presets: Record<QualityPreset, EncodeSettings> = {
    high: { crf: 15, preset: 'slow', deviceScaleFactor: 2 },
    medium: { crf: 20, preset: 'medium', deviceScaleFactor: 1 },
    low: { crf: 26, preset: 'fast', deviceScaleFactor: 1 },
  }

  const settings = presets[qualityPreset]
  return {
    ...settings,
    deviceScaleFactor: requestedScaleFactor ?? settings.deviceScaleFactor,
  }
}
