import { Laptop, Lock, Monitor, Smartphone, Tablet } from "lucide-react";
import React from "react";

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

interface CaptureTargetFieldsProps {
  url: string;
  setUrl: (u: string) => void;
  devicePreset: string;
  setDevicePreset: (p: string) => void;
  /** Screen size locked to the finished recording dimensions. URL stays editable. */
  sizeLocked?: boolean;
  disabled?: boolean;
}

/** Compact URL + device controls for the main capture toolbar. */
export function CaptureTargetFields({
  url,
  setUrl,
  devicePreset,
  setDevicePreset,
  sizeLocked = false,
  disabled = false,
}: CaptureTargetFieldsProps) {
  const activePreset =
    DEVICE_PRESETS.find((p) => p.value === devicePreset) ?? DEVICE_PRESETS[0];
  const [presetW, presetH] = devicePreset.split("x");
  const ActiveIcon = activePreset.Icon;

  return (
    <div className="capture-target-fields">
      <div className="url-input-wrap capture-url-wrap">
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
          disabled={disabled}
        />
      </div>

      {sizeLocked ? (
        <div
          className="recorder-device-locked capture-device-locked"
          role="status"
          title="Screen size matches this recording"
        >
          <span className="recorder-device-locked-main">
            <ActiveIcon size={15} strokeWidth={1.75} aria-hidden />
            <span>{activePreset.label}</span>
            <span className="recorder-device-locked-dims">
              {presetW} × {presetH}
            </span>
          </span>
          <span className="recorder-device-locked-badge">
            <Lock size={11} strokeWidth={2.2} aria-hidden />
            Size
          </span>
        </div>
      ) : (
        <div
          className="recorder-device-row capture-device-row"
          role="radiogroup"
          aria-label="Screen size"
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
                disabled={disabled}
              >
                <preset.Icon size={15} strokeWidth={1.75} aria-hidden />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <select
        id="devicePreset"
        name="devicePreset"
        className="device-preset-fallback"
        value={devicePreset}
        onChange={(e) => setDevicePreset(e.target.value)}
        tabIndex={-1}
        aria-hidden
        disabled={sizeLocked || disabled}
      >
        {DEVICE_PRESETS.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** @deprecated Prefer CaptureTargetFields in the main toolbar. */
export default function TargetPageForm(props: CaptureTargetFieldsProps) {
  return (
    <section className="recorder-setup" aria-label="Capture setup">
      <CaptureTargetFields {...props} />
    </section>
  );
}
