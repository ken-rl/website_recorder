import { Laptop, Lock, Monitor, Smartphone, Tablet } from "lucide-react";
import React from "react";

interface TargetPageFormProps {
  url: string;
  setUrl: (u: string) => void;
  devicePreset: string;
  setDevicePreset: (p: string) => void;
  /** When true, screen size is fixed to the finished recording. */
  captureLocked?: boolean;
}

export const DEVICE_PRESETS = [
  { value: "1920x1080", label: "Desktop", Icon: Monitor },
  { value: "1440x900", label: "Laptop", Icon: Laptop },
  { value: "768x1024", label: "Tablet", Icon: Tablet },
  { value: "390x844", label: "Mobile", Icon: Smartphone },
] as const;

export function deviceLabel(preset: string): string {
  return DEVICE_PRESETS.find((p) => p.value === preset)?.label ?? "Custom";
}

export function deviceIcon(preset: string) {
  return DEVICE_PRESETS.find((p) => p.value === preset)?.Icon ?? Monitor;
}

export default function TargetPageForm({
  url,
  setUrl,
  devicePreset,
  setDevicePreset,
  captureLocked = false,
}: TargetPageFormProps) {
  const activePreset =
    DEVICE_PRESETS.find((p) => p.value === devicePreset) ?? DEVICE_PRESETS[0];
  const [presetW, presetH] = devicePreset.split("x");
  const ActiveIcon = activePreset.Icon;

  return (
    <section className="recorder-setup" aria-label="Capture setup">
      <div className="recorder-field">
        <label htmlFor="url">
          Website URL
          {captureLocked && (
            <span className="recorder-field-hint"> recorded</span>
          )}
        </label>
        <div className={`url-input-wrap${captureLocked ? " is-locked" : ""}`}>
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
            readOnly={captureLocked}
            title={
              captureLocked
                ? "URL used for this recording. Unlock settings to change it for the next capture."
                : undefined
            }
          />
        </div>
      </div>

      <div className="recorder-field">
        <span className="recorder-field-label" id="viewport-label">
          Screen size
          {captureLocked && (
            <span className="recorder-field-hint"> locked to recording</span>
          )}
        </span>

        {captureLocked ? (
          <div
            className="recorder-device-locked"
            role="status"
            aria-labelledby="viewport-label"
          >
            <span className="recorder-device-locked-main">
              <ActiveIcon size={16} strokeWidth={1.75} aria-hidden />
              <span>{activePreset.label}</span>
              <span className="recorder-device-locked-dims">
                {presetW} × {presetH}
              </span>
            </span>
            <span className="recorder-device-locked-badge" title="Matches the finished video">
              <Lock size={12} strokeWidth={2.2} aria-hidden />
              Locked
            </span>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </section>
  );
}
