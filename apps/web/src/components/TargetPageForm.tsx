import { Laptop, Monitor, Smartphone, Tablet } from "lucide-react";
import React from "react";

interface TargetPageFormProps {
  url: string;
  setUrl: (u: string) => void;
  devicePreset: string;
  setDevicePreset: (p: string) => void;
}

const DEVICE_PRESETS = [
  { value: "1920x1080", label: "Desktop", Icon: Monitor },
  { value: "1440x900", label: "Laptop", Icon: Laptop },
  { value: "768x1024", label: "Tablet", Icon: Tablet },
  { value: "390x844", label: "Mobile", Icon: Smartphone },
] as const;

export default function TargetPageForm({
  url,
  setUrl,
  devicePreset,
  setDevicePreset,
}: TargetPageFormProps) {
  return (
    <section className="recorder-setup" aria-label="Capture setup">
      <div className="recorder-field">
        <label htmlFor="url">Website URL</label>
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
            className="url-input recorder-url-input"
            placeholder="https://yoursite.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            autoComplete="url"
          />
        </div>
      </div>

      <div className="recorder-field">
        <span className="recorder-field-label" id="viewport-label">
          Screen size
        </span>
        <div
          className="recorder-device-row"
          role="radiogroup"
          aria-labelledby="viewport-label"
        >
          {DEVICE_PRESETS.map((preset) => {
            const isActive = devicePreset === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={preset.label}
                title={preset.value.replace("x", " × ")}
                className={`recorder-device-btn${isActive ? " is-active" : ""}`}
                onClick={() => setDevicePreset(preset.value)}
              >
                <preset.Icon size={16} strokeWidth={1.75} aria-hidden />
                <span>{preset.label}</span>
              </button>
            );
          })}
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
              {preset.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
