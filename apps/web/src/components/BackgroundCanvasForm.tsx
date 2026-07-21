import { Circle, Image, Sparkles, Square, Wand2 } from "lucide-react";

export type BackgroundPreset =
  | "none"
  | "gray_noise_gradient"
  | "paper_blue"
  | "red_blocks_gradient";

const PRESETS: Array<{
  id: Exclude<BackgroundPreset, "none">;
  label: string;
  src: string;
}> = [
  {
    id: "gray_noise_gradient",
    label: "Graphite grain",
    src: "/background_presets/gray_noise_gradient.png",
  },
  {
    id: "paper_blue",
    label: "Blueprint paper",
    src: "/background_presets/paper_blue.png",
  },
  {
    id: "red_blocks_gradient",
    label: "Red blocks",
    src: "/background_presets/red_blocks_gradient.png",
  },
];

interface BackgroundCanvasFormProps {
  backgroundPreset: BackgroundPreset;
  setBackgroundPreset: (preset: BackgroundPreset) => void;
  addShadow: boolean;
  setAddShadow: (enabled: boolean) => void;
  roundedCorners: boolean;
  setRoundedCorners: (enabled: boolean) => void;
  onApplyStyle?: () => void;
  isApplyingStyle?: boolean;
}

export default function BackgroundCanvasForm({
  backgroundPreset,
  setBackgroundPreset,
  addShadow,
  setAddShadow,
  roundedCorners,
  setRoundedCorners,
  onApplyStyle,
  isApplyingStyle = false,
}: BackgroundCanvasFormProps) {
  const isFramed = backgroundPreset !== "none";

  const canStyle = Boolean(onApplyStyle);

  return (
    <section className="recorder-canvas-form">
      <div className="recorder-canvas-heading">
        <div className="recorder-canvas-title">
          <Image size={15} strokeWidth={1.8} aria-hidden="true" />
          <h3 className="sidebar-section-title">
            {canStyle ? "Style" : "Canvas"}
          </h3>
        </div>
      </div>

      <div className="recorder-background-grid" role="radiogroup" aria-label="Background preset">
        <button
          type="button"
          role="radio"
          aria-checked={backgroundPreset === "none"}
          className={`recorder-background-option recorder-background-none ${backgroundPreset === "none" ? "is-selected" : ""}`}
          onClick={() => setBackgroundPreset("none")}
        >
          <span className="recorder-background-none-mark"><Square size={17} strokeWidth={1.4} /></span>
          <span className="recorder-background-option-name">None</span>
        </button>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={backgroundPreset === preset.id}
            aria-label={preset.label}
            className={`recorder-background-option ${backgroundPreset === preset.id ? "is-selected" : ""}`}
            onClick={() => setBackgroundPreset(preset.id)}
          >
            <img src={preset.src} alt="" />
            <span className="recorder-background-option-name">{preset.label}</span>
          </button>
        ))}
      </div>

      <div className={`recorder-frame-toggles ${!isFramed ? "is-disabled" : ""}`} aria-label="Card styling">
        <button
          type="button"
          className={`recorder-frame-toggle ${roundedCorners ? "is-active" : ""}`}
          aria-pressed={roundedCorners}
          disabled={!isFramed}
          title="Rounded corners"
          onClick={() => setRoundedCorners(!roundedCorners)}
        >
          <Circle size={16} strokeWidth={1.8} />
          <span>Round</span>
        </button>
        <button
          type="button"
          className={`recorder-frame-toggle ${addShadow ? "is-active" : ""}`}
          aria-pressed={addShadow}
          disabled={!isFramed}
          title="Soft shadow"
          onClick={() => setAddShadow(!addShadow)}
        >
          <Sparkles size={16} strokeWidth={1.8} />
          <span>Shadow</span>
        </button>
      </div>

      {onApplyStyle && (
        <button
          type="button"
          className="recorder-apply-style"
          onClick={onApplyStyle}
          disabled={isApplyingStyle}
        >
          <Wand2 size={15} />
          <span>{isApplyingStyle ? "Rendering video…" : "Render style"}</span>
        </button>
      )}
    </section>
  );
}
