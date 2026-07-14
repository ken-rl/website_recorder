import React from "react";
import FieldLabel from "./FieldLabel";

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
  const defaultCycles = fastMode ? 6 : 8;

  return (
    <section className="virtual-scroll-form motion-block">
      <div className="motion-field">
        <FieldLabel
          htmlFor="scrollMode"
          hint="Auto picks document vs virtual wheel scrolling for fixed-viewport / WebGL sites."
        >
          Scroll mode
        </FieldLabel>
        <div
          id="scrollMode"
          className="motion-seg motion-seg--3"
          role="radiogroup"
          aria-label="Scroll strategy"
        >
          {(
            [
              { value: "auto" as const, label: "Auto" },
              { value: "document" as const, label: "Document" },
              { value: "virtual" as const, label: "Virtual" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={scrollMode === opt.value}
              className={scrollMode === opt.value ? "is-active" : undefined}
              onClick={() => setScrollMode(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {showVirtualOptions && (
        <details className="motion-advanced" open={scrollMode === "virtual"}>
          <summary>
            Virtual options
            <span>
              {virtualScrollCycles} cycles
              {useFixedDuration
                ? ` · ${(virtualScrollDurationMs / 1000).toFixed(0)}s`
                : ""}
            </span>
          </summary>
          <div className="motion-advanced-body">
            <div className="motion-field">
              <FieldLabel
                htmlFor="virtualScrollCycles"
                hint={`Viewport-heights of wheel input. Default ${defaultCycles}.`}
              >
                Cycles
              </FieldLabel>
              <input
                type="number"
                id="virtualScrollCycles"
                className="motion-number-input"
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

            <label className="motion-check" htmlFor="useFixedDuration">
              <input
                type="checkbox"
                id="useFixedDuration"
                checked={useFixedDuration}
                onChange={(e) => setUseFixedDuration(e.target.checked)}
              />
              <span>Fixed duration</span>
            </label>

            {useFixedDuration && (
              <div className="motion-field">
                <FieldLabel htmlFor="virtualScrollDurationMs">
                  Duration (ms)
                </FieldLabel>
                <input
                  type="number"
                  id="virtualScrollDurationMs"
                  className="motion-number-input"
                  min={3000}
                  max={120000}
                  step={1000}
                  value={virtualScrollDurationMs}
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
            )}
          </div>
        </details>
      )}
    </section>
  );
}
