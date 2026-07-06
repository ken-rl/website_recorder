import React from "react";
import FieldLabel from "./FieldLabel";
import InfoTooltip from "./InfoTooltip";

export type ScrollModeOption = "auto" | "document" | "virtual";

interface VirtualScrollFormProps {
  scrollMode: ScrollModeOption;
  setScrollMode: (mode: ScrollModeOption) => void;
  virtualScrollCycles: number;
  setVirtualScrollCycles: (cycles: number) => void;
  useFixedDuration: boolean;
  setUseFixedDuration: (value: boolean) => void;
  virtualScrollDurationMs: number;
  setVirtualScrollDurationMs: (ms: number) => void;
  fastMode: boolean;
}

export default function VirtualScrollForm({
  scrollMode,
  setScrollMode,
  virtualScrollCycles,
  setVirtualScrollCycles,
  useFixedDuration,
  setUseFixedDuration,
  virtualScrollDurationMs,
  setVirtualScrollDurationMs,
  fastMode,
}: VirtualScrollFormProps) {
  const showVirtualOptions = scrollMode === "auto" || scrollMode === "virtual";

  return (
    <div className="virtual-scroll-form">
      <div className="field">
        <FieldLabel
          htmlFor="scrollMode"
          hint="Auto picks document scrolling for normal pages, or virtual wheel scrolling for fixed-viewport and infinite-loop sites like WebGL experiences. Virtual capture uses a visible browser window when needed for smooth video."
        >
          Scroll Strategy
        </FieldLabel>
        <select
          id="scrollMode"
          value={scrollMode}
          onChange={(e) => setScrollMode(e.target.value as ScrollModeOption)}
        >
          <option value="auto">Auto-detect (recommended)</option>
          <option value="document">Document scroll</option>
          <option value="virtual">Virtual scroll (wheel input)</option>
        </select>
      </div>

      <div
        className={`virtual-scroll-options${showVirtualOptions ? "" : " hidden"}`}
      >
        <div className="field">
          <FieldLabel
            htmlFor="virtualScrollCycles"
            hint={`Viewport-heights of scroll to replay. Default is ${fastMode ? "6" : "8"} cycles (~${fastMode ? "4.5" : "10"}s). Use Linear curve for smoothest infinite-loop captures.`}
          >
            Virtual scroll cycles
          </FieldLabel>
          <input
            type="number"
            id="virtualScrollCycles"
            min={1}
            max={40}
            step={1}
            value={virtualScrollCycles}
            onChange={(e) =>
              setVirtualScrollCycles(
                Math.min(40, Math.max(1, Number(e.target.value) || 1)),
              )
            }
          />
        </div>

        <div className="field">
          <label className="checkbox-row" htmlFor="useFixedDuration">
            <input
              type="checkbox"
              id="useFixedDuration"
              checked={useFixedDuration}
              onChange={(e) => setUseFixedDuration(e.target.checked)}
            />
            <span>Use fixed scroll duration (ms)</span>
            <InfoTooltip text="Optional override. Leave unchecked to derive duration from cycles and scroll speed." />
          </label>
          <input
            type="number"
            id="virtualScrollDurationMs"
            min={3000}
            max={120000}
            step={1000}
            value={virtualScrollDurationMs}
            disabled={!useFixedDuration}
            onChange={(e) =>
              setVirtualScrollDurationMs(
                Math.min(
                  120000,
                  Math.max(3000, Number(e.target.value) || 3000),
                ),
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
