import React from "react";
import FieldLabel from "./FieldLabel";
import BezierVisualizer from "./BezierVisualizer";

interface ScrollPhysicsFormProps {
  selectedCurve: string;
  setSelectedCurve: (c: string) => void;
  customBezier: [number, number, number, number];
  setCustomBezier: (b: [number, number, number, number]) => void;
  pixelsPerFrame: number;
  setPixelsPerFrame: (p: number) => void;
  heroHoldMs: number;
  setHeroHoldMs: (ms: number) => void;
}

const HERO_PRESETS = [
  { value: 0, label: "Off" },
  { value: 1000, label: "1s" },
  { value: 1500, label: "1.5s" },
  { value: 2000, label: "2s" },
] as const;

export default function ScrollPhysicsForm({
  selectedCurve,
  setSelectedCurve,
  customBezier,
  setCustomBezier,
  pixelsPerFrame,
  setPixelsPerFrame,
  heroHoldMs,
  setHeroHoldMs,
}: ScrollPhysicsFormProps) {
  return (
    <div className="scroll-physics-form motion-stack">
      <section className="motion-block">
        <div className="motion-block-head">
          <h4 className="motion-block-title">Curve</h4>
        </div>
        <select
          id="curveSelect"
          className="motion-select"
          value={selectedCurve}
          onChange={(e) => setSelectedCurve(e.target.value)}
          aria-label="Scroll easing curve"
        >
          <option value="linear">Linear — constant speed</option>
          <option value="ease-in">Ease in — slow start</option>
          <option value="ease-out">Ease out — slow end</option>
          <option value="ease-in-out">Ease in-out</option>
          <option value="ease-in-cubic">In cubic</option>
          <option value="ease-out-cubic">Out cubic</option>
          <option value="ease-in-out-cubic">In-out cubic</option>
          <option value="custom">Custom — drag handles</option>
        </select>
        <div className="curve-visualizer-container">
          <BezierVisualizer
            selectedCurve={selectedCurve}
            setSelectedCurve={setSelectedCurve}
            customBezier={customBezier}
            setCustomBezier={setCustomBezier}
            embedded={true}
            pixelsPerFrame={pixelsPerFrame}
          />
        </div>
      </section>

      <section className="motion-block">
        <div className="motion-field">
          <div className="motion-field-head">
            <FieldLabel
              htmlFor="speedRange"
              hint="Higher values scroll more pixels per frame (faster, shorter videos)."
            >
              Speed
            </FieldLabel>
            <span className="motion-field-value">
              {pixelsPerFrame} px/frame
            </span>
          </div>
          <input
            type="range"
            id="speedRange"
            className="motion-slider"
            min={6}
            max={48}
            step={2}
            value={pixelsPerFrame}
            onChange={(e) => setPixelsPerFrame(Number(e.target.value))}
            aria-valuetext={`${pixelsPerFrame} pixels per frame`}
          />
          <div className="motion-slider-ends" aria-hidden>
            <span>Slow</span>
            <span>Fast</span>
          </div>
        </div>

        <div className="motion-field">
          <FieldLabel
            htmlFor="heroHold"
            hint="Hold on the top of the page before scrolling so hero content can settle."
          >
            Hero hold
          </FieldLabel>
          <div
            id="heroHold"
            className="motion-seg"
            role="radiogroup"
            aria-label="Hero hold duration"
          >
            {HERO_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                role="radio"
                aria-checked={heroHoldMs === preset.value}
                className={heroHoldMs === preset.value ? "is-active" : undefined}
                onClick={() => setHeroHoldMs(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
