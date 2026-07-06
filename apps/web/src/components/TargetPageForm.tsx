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

const DEVICE_PRESETS = [
  { value: "1920x1080", label: "Desktop", detail: "1920 × 1080" },
  { value: "1440x900", label: "Laptop", detail: "1440 × 900" },
  { value: "768x1024", label: "Tablet", detail: "768 × 1024" },
  { value: "390x844", label: "Mobile", detail: "390 × 844" },
] as const;

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
    <section className="panel target-panel">
      <div className="panel-hero">
        <span className="panel-step">Step 1</span>
        <div className="panel-hero-copy">
          <h2 className="panel-hero-title">Target Page</h2>
          <p className="panel-hero-desc">
            Enter the URL and viewport for your scroll capture.
          </p>
        </div>
      </div>

      <div className="field url-field">
        <label htmlFor="url">Target URL</label>
        <div className="url-input-wrap">
          <svg
            className="url-input-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <input
            type="url"
            id="url"
            name="url"
            className="url-input"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="field">
        <label>Device Viewport</label>
        <div
          className="device-preset-grid"
          role="radiogroup"
          aria-label="Device viewport"
        >
          {DEVICE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              role="radio"
              aria-checked={devicePreset === preset.value}
              className={`device-preset-card${devicePreset === preset.value ? " is-active" : ""}`}
              onClick={() => setDevicePreset(preset.value)}
            >
              <span className="device-preset-label">{preset.label}</span>
              <span className="device-preset-detail">{preset.detail}</span>
            </button>
          ))}
        </div>
        <select
          id="devicePreset"
          name="devicePreset"
          className="device-preset-fallback"
          value={devicePreset}
          onChange={(e) => setDevicePreset(e.target.value)}
          tabIndex={-1}
          aria-hidden
        >
          {DEVICE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label} ({preset.detail})
            </option>
          ))}
        </select>
      </div>

      <div
        className={`field quality-field${fastMode ? " is-disabled" : ""}`}
        id="qualityField"
      >
        <label htmlFor="quality">Render Quality</label>
        <select
          id="quality"
          name="quality"
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          disabled={fastMode}
        >
          <option value="high">High — 2× capture, crisp detail</option>
          <option value="medium">Medium — balanced speed & quality</option>
          <option value="low">Low — fastest encode</option>
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
