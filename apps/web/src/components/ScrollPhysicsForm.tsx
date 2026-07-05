import React from "react";

interface ScrollPhysicsFormProps {
  selectedCurve: string;
  setSelectedCurve: (c: string) => void;
  customBezier: [number, number, number, number];
  setCustomBezier: (b: [number, number, number, number]) => void;
  customInputText: string;
  setCustomInputText: (t: string) => void;
}

export default function ScrollPhysicsForm({
  selectedCurve,
  setSelectedCurve,
  customBezier,
  setCustomBezier,
  customInputText,
  setCustomInputText,
}: ScrollPhysicsFormProps) {

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="field">
        <label htmlFor="curveSelect">Timeline Interpolation Curve</label>
        <select
          id="curveSelect"
          value={selectedCurve}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedCurve(val);
            if (val === "custom") {
              setCustomInputText(customBezier.map((n) => n.toFixed(2)).join(", "));
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
    </div>
  );
}
