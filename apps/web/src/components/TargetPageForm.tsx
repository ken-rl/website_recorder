import React from "react";

interface TargetPageFormProps {
  url: string;
  setUrl: (u: string) => void;
  devicePreset: string;
  setDevicePreset: (p: string) => void;
  quality: string;
  setQuality: (q: string) => void;
  fastMode: boolean;
}

export default function TargetPageForm({
  url,
  setUrl,
  devicePreset,
  setDevicePreset,
  quality,
  setQuality,
  fastMode,
}: TargetPageFormProps) {
  return (
    <section className="panel">
      <div className="panel-title">Target Page</div>

      <div className="field">
        <label htmlFor="url">Target URL</label>
        <input
          type="url"
          id="url"
          name="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="devicePreset">Device Viewport</label>
        <select
          id="devicePreset"
          name="devicePreset"
          value={devicePreset}
          onChange={(e) => setDevicePreset(e.target.value)}
        >
          <option value="1920x1080">Desktop (1920 × 1080)</option>
          <option value="1440x900">Laptop (1440 × 900)</option>
          <option value="768x1024">Tablet (768 × 1024)</option>
          <option value="390x844">Mobile Phone (390 × 844)</option>
        </select>
      </div>

      <div 
        className="field" 
        id="qualityField" 
        style={{ 
          opacity: fastMode ? 0.45 : 1, 
          pointerEvents: fastMode ? "none" : "auto" 
        }}
      >
        <label htmlFor="quality">Render Quality</label>
        <select
          id="quality"
          name="quality"
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
        >
          <option value="high">High (2x capture, slow encode)</option>
          <option value="medium">Medium (1.5x capture, standard)</option>
          <option value="low">Low (1x capture, fast encode)</option>
        </select>
        <p className="hint" id="qualityHint">
          {fastMode
            ? "Fast mode uses quick encoding and skips high-quality capture."
            : "High quality samples at 2× scale for crisp renders."}
        </p>
      </div>
    </section>
  );
}
