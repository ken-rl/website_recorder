import React from "react";
import type { TimelineBlock } from "../lib/editorTimeline";
import { exportPercent } from "../lib/editorTimeline";

interface EditorTimelineProps {
  blocks: TimelineBlock[];
  exportDurationMs: number;
  exportMs: number;
  selectedPauseId: string | null;
  dragTarget: string | null;
  onSeekExport: (exportMs: number) => void;
  onTrimStartDrag: () => void;
  onTrimEndDrag: () => void;
  onPauseDrag: (pauseId: string, clientX: number) => void;
  onPauseResize: (pauseId: string) => void;
  onSelectPause: (pauseId: string) => void;
  timelineRef: React.RefObject<HTMLDivElement | null>;
}

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, ms) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

export default function EditorTimeline({
  blocks,
  exportDurationMs,
  exportMs,
  selectedPauseId,
  dragTarget,
  onSeekExport,
  onTrimStartDrag,
  onTrimEndDrag,
  onPauseDrag,
  onPauseResize,
  onSelectPause,
  timelineRef,
}: EditorTimelineProps) {
  const rulerStepMs =
    exportDurationMs > 60000
      ? 10000
      : exportDurationMs > 20000
        ? 5000
        : exportDurationMs > 8000
          ? 2000
          : 1000;

  const rulerMarks: number[] = [];
  for (let ms = 0; ms <= exportDurationMs; ms += rulerStepMs) {
    rulerMarks.push(ms);
  }
  if (rulerMarks[rulerMarks.length - 1] !== exportDurationMs) {
    rulerMarks.push(exportDurationMs);
  }

  return (
    <div className={`tl-root${dragTarget ? " is-dragging" : ""}`}>
      <div className="tl-ruler">
        {rulerMarks.map((mark) => (
          <span
            key={mark}
            className="tl-ruler-mark"
            style={{ left: `${exportPercent(mark, exportDurationMs)}%` }}
          >
            {formatTime(mark)}
          </span>
        ))}
      </div>

      <div className="tl-track-wrap">
        <div className="tl-track-label">Output</div>
        <div
          ref={timelineRef}
          className="tl-track"
          onClick={(event) => {
            if (dragTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(
              1,
              Math.max(0, (event.clientX - rect.left) / rect.width),
            );
            onSeekExport(Math.round(ratio * exportDurationMs));
          }}
        >
          {blocks.map((block, index) => {
            const widthMs = block.exportEndMs - block.exportStartMs;
            const left = exportPercent(block.exportStartMs, exportDurationMs);
            const width = exportPercent(widthMs, exportDurationMs);

            if (block.type === "freeze") {
              return (
                <div
                  key={`${block.pauseId ?? "freeze"}-${index}`}
                  className={`tl-block tl-block-freeze${selectedPauseId === block.pauseId ? " is-selected" : ""}${dragTarget === block.pauseId ? " is-dragging" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onMouseDown={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        ".tl-freeze-handle-end",
                      )
                    ) {
                      return;
                    }
                    event.stopPropagation();
                    event.preventDefault();
                    if (block.pauseId)
                      onPauseDrag(block.pauseId, event.clientX);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (block.pauseId) onSelectPause(block.pauseId);
                  }}
                >
                  <span className="tl-freeze-label">
                    {(widthMs / 1000).toFixed(1)}s hold
                  </span>
                  <button
                    type="button"
                    className="tl-freeze-handle tl-freeze-handle-end"
                    aria-label="Resize hold"
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      if (block.pauseId) onPauseResize(block.pauseId);
                    }}
                  />
                </div>
              );
            }

            return (
              <div
                key={`play-${index}`}
                className="tl-block tl-block-play"
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          })}

          <div
            className="tl-playhead"
            style={{ left: `${exportPercent(exportMs, exportDurationMs)}%` }}
          />

          <button
            type="button"
            className="tl-trim-handle tl-trim-handle-start"
            style={{ left: "0%" }}
            aria-label="Trim start"
            onMouseDown={(event) => {
              event.stopPropagation();
              onTrimStartDrag();
            }}
          />
          <button
            type="button"
            className="tl-trim-handle tl-trim-handle-end"
            style={{ left: "100%" }}
            aria-label="Trim end"
            onMouseDown={(event) => {
              event.stopPropagation();
              onTrimEndDrag();
            }}
          />
        </div>
      </div>
    </div>
  );
}
