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
  durationSeconds: number;
  setDurationSeconds: (d: number) => void;
}

export default function ScrollPhysicsForm({
  selectedCurve,
  setSelectedCurve,
  customBezier,
  setCustomBezier,
  customInputText,
  setCustomInputText,
  durationSeconds,
  setDurationSeconds,
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

      <div className="field">
        <FieldLabel htmlFor="durationRange">
          Scroll Duration: {durationSeconds}s
        </FieldLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            type="range"
            id="durationRange"
            min="3"
            max="45"
            step="1"
            value={durationSeconds}
            onChange={(e) => setDurationSeconds(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div className="duration-presets" style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`preset-btn ${durationSeconds === 6 ? 'active' : ''}`}
              onClick={() => setDurationSeconds(6)}
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '4px 8px',
                border: '1px solid var(--border)',
                background: durationSeconds === 6 ? 'var(--accent)' : 'transparent',
                color: durationSeconds === 6 ? '#000000' : 'var(--text-primary)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Snappy (6s)
            </button>
            <button
              type="button"
              className={`preset-btn ${durationSeconds === 12 ? 'active' : ''}`}
              onClick={() => setDurationSeconds(12)}
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '4px 8px',
                border: '1px solid var(--border)',
                background: durationSeconds === 12 ? 'var(--accent)' : 'transparent',
                color: durationSeconds === 12 ? '#000000' : 'var(--text-primary)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Balanced (12s)
            </button>
            <button
              type="button"
              className={`preset-btn ${durationSeconds === 24 ? 'active' : ''}`}
              onClick={() => setDurationSeconds(24)}
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '4px 8px',
                border: '1px solid var(--border)',
                background: durationSeconds === 24 ? 'var(--accent)' : 'transparent',
                color: durationSeconds === 24 ? '#000000' : 'var(--text-primary)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Cinematic (24s)
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
          durationSeconds={durationSeconds}
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
