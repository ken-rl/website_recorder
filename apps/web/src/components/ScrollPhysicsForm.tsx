import React from "react";
import FieldLabel from "./FieldLabel";
import BezierVisualizer from "./BezierVisualizer";

interface ScrollPhysicsFormProps {
  selectedCurve: string;
  setSelectedCurve: (c: string) => void;
  customBezier: [number, number, number, number];
  setCustomBezier: (b: [number, number, number, number]) => void;
  customInputText: string;
  setCustomInputText: (t: string) => void;
  pixelsPerFrame: number;
  setPixelsPerFrame: (p: number) => void;
  heroHoldMs: number;
  setHeroHoldMs: (ms: number) => void;
}

export default function ScrollPhysicsForm({
  selectedCurve,
  setSelectedCurve,
  customBezier,
  setCustomBezier,
  customInputText,
  setCustomInputText,
  pixelsPerFrame,
  setPixelsPerFrame,
  heroHoldMs,
  setHeroHoldMs,
}: ScrollPhysicsFormProps) {
  const handleBezierTextInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = e.target.value;
    setCustomInputText(val);
    if (selectedCurve === "custom") {
      const parts = val.split(",").map((p) => Number(p.trim()));
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        setCustomBezier(parts as [number, number, number, number]);
      }
    }
  };

  return (
    <div className="scroll-physics-form">
      <div className="field">
        <FieldLabel htmlFor="curveSelect">
          Timeline Interpolation Curve
        </FieldLabel>
        <select
          id="curveSelect"
          value={selectedCurve}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedCurve(val);
            if (val === "custom") {
              setCustomInputText(
                customBezier.map((n) => n.toFixed(2)).join(", "),
              );
            }
          }}
        >
          <option value="linear">Linear (Constant speed)</option>
          <option value="ease-in">Ease In (Slow start)</option>
          <option value="ease-out">Ease Out (Slow end)</option>
          <option value="ease-in-out">Ease In-Out (Slow start & end)</option>
          <option value="ease-in-cubic">In Cubic (Strong slow start)</option>
          <option value="ease-out-cubic">Out Cubic (Strong slow end)</option>
          <option value="ease-in-out-cubic">In-Out Cubic (Heavy easing)</option>
          <option value="custom">Custom (Visual Handle Editor)</option>
        </select>
      </div>

      <div className="field hero-hold-control">
        <FieldLabel htmlFor="heroHold">Hero hold</FieldLabel>
        <div className="hero-hold-options" id="heroHold" role="radiogroup" aria-label="Hero hold duration">
          {[0, 1000, 2000, 3000].map((duration) => (
            <button
              key={duration}
              type="button"
              role="radio"
              aria-checked={heroHoldMs === duration}
              className={heroHoldMs === duration ? "is-active" : ""}
              onClick={() => setHeroHoldMs(duration)}
            >
              {duration === 0 ? "Off" : `${duration / 1000}s`}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <FieldLabel htmlFor="speedRange">
          Scroll Speed: {pixelsPerFrame} px/frame ({pixelsPerFrame * 60} px/s)
        </FieldLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            type="range"
            id="speedRange"
            min="6"
            max="48"
            step="2"
            value={pixelsPerFrame}
            onChange={(e) => setPixelsPerFrame(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div className="speed-presets" style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`preset-btn ${pixelsPerFrame === 8 ? 'active' : ''}`}
              onClick={() => setPixelsPerFrame(8)}
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '4px 8px',
                border: '1px solid var(--border)',
                background: pixelsPerFrame === 8 ? 'var(--accent)' : 'transparent',
                color: pixelsPerFrame === 8 ? '#000000' : 'var(--text-primary)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Very Slow (8px)
            </button>
            <button
              type="button"
              className={`preset-btn ${pixelsPerFrame === 12 ? 'active' : ''}`}
              onClick={() => setPixelsPerFrame(12)}
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '4px 8px',
                border: '1px solid var(--border)',
                background: pixelsPerFrame === 12 ? 'var(--accent)' : 'transparent',
                color: pixelsPerFrame === 12 ? '#000000' : 'var(--text-primary)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Slow (12px)
            </button>
            <button
              type="button"
              className={`preset-btn ${pixelsPerFrame === 18 ? 'active' : ''}`}
              onClick={() => setPixelsPerFrame(18)}
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '4px 8px',
                border: '1px solid var(--border)',
                background: pixelsPerFrame === 18 ? 'var(--accent)' : 'transparent',
                color: pixelsPerFrame === 18 ? '#000000' : 'var(--text-primary)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Normal (18px)
            </button>
            <button
              type="button"
              className={`preset-btn ${pixelsPerFrame === 28 ? 'active' : ''}`}
              onClick={() => setPixelsPerFrame(28)}
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '4px 8px',
                border: '1px solid var(--border)',
                background: pixelsPerFrame === 28 ? 'var(--accent)' : 'transparent',
                color: pixelsPerFrame === 28 ? '#000000' : 'var(--text-primary)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Fast (28px)
            </button>
          </div>
        </div>
      </div>

      <div className="field curve-visualizer-container">
        <BezierVisualizer
          selectedCurve={selectedCurve}
          setSelectedCurve={setSelectedCurve}
          customBezier={customBezier}
          setCustomBezier={setCustomBezier}
          customInputText={customInputText}
          setCustomInputText={setCustomInputText}
          embedded={true}
          pixelsPerFrame={pixelsPerFrame}
        />
      </div>

      <div
        className={`field${selectedCurve !== "custom" ? " hidden" : ""}`}
        id="customBezierField"
      >
        <FieldLabel
          htmlFor="customBezier"
          hint="Standard CSS cubic-bezier parameters, e.g. 0.42, 0, 0.58, 1"
        >
          Custom Cubic Bezier
        </FieldLabel>
        <input
          type="text"
          id="customBezier"
          name="customBezier"
          value={customInputText}
          onChange={handleBezierTextInputChange}
          placeholder="x1, y1, x2, y2"
        />
      </div>
    </div>
  );
}
