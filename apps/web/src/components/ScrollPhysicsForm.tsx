import React from "react";
import { CURVES } from "./BezierVisualizer";

interface ScrollPhysicsFormProps {
  selectedCurve: string;
  setSelectedCurve: (c: string) => void;
  customBezier: [number, number, number, number];
  setCustomBezier: (b: [number, number, number, number]) => void;
  customInputText: string;
  setCustomInputText: (t: string) => void;
  fastMode: boolean;
  setFastMode: (fm: boolean) => void;
}

export default function ScrollPhysicsForm({
  selectedCurve,
  setSelectedCurve,
  customBezier,
  setCustomBezier,
  customInputText,
  setCustomInputText,
  fastMode,
  setFastMode,
}: ScrollPhysicsFormProps) {
  
  function sampleCurveY(bezier: [number, number, number, number], linearProgress: number) {
    const [x1, y1, x2, y2] = bezier;
    function sampleX(t: number) {
      const inv = 1 - t;
      return 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t;
    }
    function sampleY(t: number) {
      const inv = 1 - t;
      return 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t;
    }
    if (linearProgress <= 0) return 0;
    if (linearProgress >= 1) return 1;

    let start = 0;
    let end = 1;
    let param = linearProgress;
    for (let i = 0; i < 8; i += 1) {
      param = (start + end) / 2;
      if (sampleX(param) < linearProgress) start = param;
      else end = param;
    }
    return sampleY(param);
  }

  function curvePoints(bezier: [number, number, number, number], width: number, height: number, padding: number) {
    const points = [];
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;

    for (let i = 0; i <= 32; i += 1) {
      const t = i / 32;
      const y = sampleCurveY(bezier, t);
      points.push({
        x: padding + t * innerW,
        y: padding + innerH - y * innerH,
      });
    }
    return points;
  }

  function drawCurveSvg(bezier: [number, number, number, number]) {
    const points = curvePoints(bezier, 100, 36, 4);
    const path = points
      .map((point, index) => (index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`))
      .join(" ");

    return (
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="curve-card-svg" aria-hidden="true" style={{ width: "100%", height: "40px" }}>
        <path d="M4 32 L96 32" stroke="var(--border)" strokeWidth="1" fill="none" />
        <path d="M4 4 L4 32" stroke="var(--border)" strokeWidth="1" fill="none" />
        <path d={path} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }

  const handleBezierTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    <section className="panel">
      <div className="panel-title">Scroll Physics</div>

      <div className="field">
        <div className="toggle-row">
          <div className="toggle-copy">
            <strong>Fast Hydration Mode</strong>
            <span>Skips heavy page hydration delays and speeds up scrolling dynamics.</span>
          </div>
          <label className="toggle" aria-label="Fast mode">
            <input
              type="checkbox"
              id="fastMode"
              checked={fastMode}
              onChange={(e) => setFastMode(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div className="curve-selection-area">
        <label>Timeline Interpolation Curve</label>
        <div className="curve-grid" id="curveGrid">
          {CURVES.map((curve) => {
            const active = curve.id === selectedCurve;
            return (
              <button
                key={curve.id}
                type="button"
                className={`curve-card${active ? " active" : ""}${curve.wide ? " wide" : ""}`}
                onClick={() => {
                  setSelectedCurve(curve.id);
                  if (curve.id === "custom") {
                    setCustomInputText(customBezier.map((n) => n.toFixed(2)).join(", "));
                  }
                }}
              >
                {drawCurveSvg(curve.bezier)}
                {curve.wide ? (
                  <div className="curve-card-info">
                    <span className="curve-card-name">{curve.label}</span>
                    <span className="curve-card-desc">{curve.desc}</span>
                  </div>
                ) : (
                  <>
                    <span className="curve-card-name">{curve.label}</span>
                    <span className="curve-card-desc">{curve.desc}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`field${selectedCurve !== "custom" ? " hidden" : ""}`} id="customBezierField">
        <label htmlFor="customBezier">Custom Cubic Bezier</label>
        <input
          type="text"
          id="customBezier"
          name="customBezier"
          value={customInputText}
          onChange={handleBezierTextInputChange}
          placeholder="x1, y1, x2, y2"
        />
        <p className="hint">
          Standard CSS cubic-bezier parameters, e.g. 0.42, 0, 0.58, 1
        </p>
      </div>
    </section>
  );
}
