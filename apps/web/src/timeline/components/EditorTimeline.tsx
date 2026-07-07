import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { TimelineBlock } from "../../lib/editorTimeline";
import {
  exportMsToSourcePlayheadPercent,
  sourcePercent,
} from "../../lib/editorTimeline";
import { pauseHoldWidthPercent } from "../utils";

export interface EditorTimelineHandle {
  setPlayheadPercent: (percent: number) => void;
}

interface EditorZoom {
  id: string;
  atMs: number;
  durationMs: number;
  scale: number;
  x: number;
  y: number;
}

interface EditorTimelineProps {
  blocks: TimelineBlock[];
  sourceDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  exportMs: number;
  selectedPauseId: string | null;
  trimDragHandle: "start" | "end" | null;
  pauseDragId: string | null;
  pauseDragMode: "move" | "resize" | null;
  isPlaying: boolean;
  isScrubbing: boolean;
  onTrackMouseDown: (clientX: number, clientY: number) => void;
  onPlayheadMouseDown: (clientX: number, clientY: number) => void;
  onTrimStartDrag: () => void;
  onTrimEndDrag: () => void;
  onPauseDrag: (pauseId: string, clientX: number) => void;
  onPauseResize: (pauseId: string) => void;
  onSelectPause: (pauseId: string) => void;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  zooms: EditorZoom[];
  selectedZoomId: string | null;
  onSelectZoom: (zoomId: string) => void;
  onZoomDrag: (zoomId: string, clientX: number) => void;
  onZoomResize: (zoomId: string, clientX: number) => void;
}

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, ms) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

const EditorTimeline = forwardRef<EditorTimelineHandle, EditorTimelineProps>(
  function EditorTimeline(
    {
      blocks,
      sourceDurationMs,
      trimStartMs,
      trimEndMs,
      exportMs,
      selectedPauseId,
      trimDragHandle,
      pauseDragId,
      pauseDragMode,
      isPlaying,
      isScrubbing,
      onTrackMouseDown,
      onPlayheadMouseDown,
      onTrimStartDrag,
      onTrimEndDrag,
      onPauseDrag,
      onPauseResize,
      onSelectPause,
      timelineRef,
      zooms,
      selectedZoomId,
      onSelectZoom,
      onZoomDrag,
      onZoomResize,
    },
    ref,
  ) {
    const playheadRef = useRef<HTMLDivElement>(null);
    const isDragging = trimDragHandle !== null || pauseDragId !== null;

    const pauseBlocks = useMemo(
      () => blocks.filter((block) => block.type === "freeze" && block.pauseId),
      [blocks],
    );

    useImperativeHandle(ref, () => ({
      setPlayheadPercent: (percent: number) => {
        if (playheadRef.current) {
          playheadRef.current.style.left = `${percent}%`;
        }
      },
    }));

    const rulerStepMs =
      sourceDurationMs > 60000
        ? 10000
        : sourceDurationMs > 20000
          ? 5000
          : sourceDurationMs > 8000
            ? 2000
            : 1000;

    const rulerMarks = useMemo(() => {
      const marks: number[] = [];
      for (let ms = 0; ms <= sourceDurationMs; ms += rulerStepMs) {
        marks.push(ms);
      }
      if (marks[marks.length - 1] !== sourceDurationMs) {
        marks.push(sourceDurationMs);
      }
      return marks;
    }, [rulerStepMs, sourceDurationMs]);

    const playheadPercent = exportMsToSourcePlayheadPercent(
      exportMs,
      sourceDurationMs,
      blocks,
    );

    useEffect(() => {
      if (isPlaying || isScrubbing) return;
      if (playheadRef.current) {
        playheadRef.current.style.left = `${playheadPercent}%`;
      }
    }, [isPlaying, isScrubbing, playheadPercent]);

    const trimStartPercent = sourcePercent(trimStartMs, sourceDurationMs);
    const trimEndPercent = sourcePercent(trimEndMs, sourceDurationMs);
    const trimWidthPercent = Math.max(0, trimEndPercent - trimStartPercent);

    return (
      <div
        className={`tl-root${isDragging || isScrubbing ? " is-dragging" : ""}`}
      >
        <div className="tl-ruler">
          {rulerMarks.map((mark) => (
            <span
              key={mark}
              className="tl-ruler-mark"
              style={{ left: `${sourcePercent(mark, sourceDurationMs)}%` }}
            >
              {formatTime(mark)}
            </span>
          ))}
        </div>

        <div className="tl-track-wrap">
          <div className="tl-track-label">Src</div>
          <div className="tl-track-host">
            <div
              ref={timelineRef}
              className="tl-track tl-track-source"
              onMouseDown={(event) => {
                if (
                  (event.target as HTMLElement).closest(
                    ".tl-trim-handle, .tl-pause, .tl-playhead, .tl-zoom",
                  )
                ) {
                  return;
                }
                event.preventDefault();
                onTrackMouseDown(event.clientX, event.clientY);
              }}
            >
              <div className="tl-source-base" aria-hidden />

              {trimStartPercent > 0 && (
                <div
                  className="tl-trim-ghost tl-trim-ghost-start"
                  style={{ width: `${trimStartPercent}%` }}
                  aria-hidden
                />
              )}

              {trimEndPercent < 100 && (
                <div
                  className="tl-trim-ghost tl-trim-ghost-end"
                  style={{
                    left: `${trimEndPercent}%`,
                    width: `${100 - trimEndPercent}%`,
                  }}
                  aria-hidden
                />
              )}

              <div
                className="tl-trim-window"
                style={{
                  left: `${trimStartPercent}%`,
                  width: `${trimWidthPercent}%`,
                }}
                aria-hidden
              />
            </div>

            <div className="tl-track-overlay" aria-hidden={false}>
              {pauseBlocks.map((block, index) => {
                const pauseId = block.pauseId!;
                const holdMs = block.exportEndMs - block.exportStartMs;
                const left = sourcePercent(
                  block.sourceStartMs,
                  sourceDurationMs,
                );
                const width = pauseHoldWidthPercent(holdMs, sourceDurationMs);
                const isSelected = selectedPauseId === pauseId;
                const isPauseDragging = pauseDragId === pauseId;
                const isResizing =
                  isPauseDragging && pauseDragMode === "resize";

                return (
                  <div
                    key={`pause-${pauseId}-${index}`}
                    className={`tl-pause${isSelected ? " is-selected" : ""}${isPauseDragging ? " is-dragging" : ""}${isResizing ? " is-resizing" : ""}`}
                    style={{
                      left: `${left}%`,
                      width: `${Math.max(width, 0.35)}%`,
                    }}
                    onMouseDown={(event) => {
                      if (
                        (event.target as HTMLElement).closest(
                          ".tl-pause-handle-end",
                        )
                      ) {
                        return;
                      }
                      event.stopPropagation();
                      event.preventDefault();
                      onPauseDrag(pauseId, event.clientX);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectPause(pauseId);
                    }}
                  >
                    <div className="tl-pause-anchor" aria-hidden />
                    <div className="tl-pause-body">
                      <span className="tl-pause-label">
                        {(holdMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <button
                      type="button"
                      className="tl-pause-handle-end"
                      aria-label="Resize hold duration"
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        onPauseResize(pauseId);
                      }}
                    />
                  </div>
                );
              })}

              {zooms.map((zoom) => {
                const left = sourcePercent(zoom.atMs, sourceDurationMs);
                const width = pauseHoldWidthPercent(zoom.durationMs, sourceDurationMs);
                const isSelected = selectedZoomId === zoom.id;
                return (
                  <div
                    key={`zoom-${zoom.id}`}
                    className={`tl-zoom${isSelected ? " is-selected" : ""}`}
                    style={{
                      left: `${left}%`,
                      width: `${Math.max(width, 0.5)}%`,
                    }}
                    onMouseDown={(event) => {
                      if (
                        (event.target as HTMLElement).closest(
                          ".tl-zoom-handle-end",
                        )
                      ) {
                        return;
                      }
                      event.stopPropagation();
                      event.preventDefault();
                      onSelectZoom(zoom.id);
                      onZoomDrag(zoom.id, event.clientX);
                    }}
                  >
                    <div className="tl-zoom-anchor" aria-hidden />
                    <div className="tl-zoom-body">
                      <span className="tl-zoom-label">
                        🔍 {zoom.scale.toFixed(1)}x
                      </span>
                    </div>
                    <button
                      type="button"
                      className="tl-zoom-handle-end"
                      aria-label="Resize zoom duration"
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        onZoomResize(zoom.id, event.clientX);
                      }}
                    />
                  </div>
                );
              })}

              <div
                ref={playheadRef}
                className={`tl-playhead${isPlaying ? " is-playing" : ""}${isScrubbing ? " is-scrubbing" : ""}`}
                style={{ left: `${playheadPercent}%` }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onPlayheadMouseDown(event.clientX, event.clientY);
                }}
              />

              <button
                type="button"
                className={`tl-trim-handle tl-trim-handle-start${trimDragHandle === "start" ? " is-dragging" : ""}`}
                style={{ left: `${trimStartPercent}%` }}
                aria-label="Trim in"
                onMouseDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onTrimStartDrag();
                }}
              />
              <button
                type="button"
                className={`tl-trim-handle tl-trim-handle-end${trimDragHandle === "end" ? " is-dragging" : ""}`}
                style={{ left: `${trimEndPercent}%` }}
                aria-label="Trim out"
                onMouseDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onTrimEndDrag();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);

export default EditorTimeline;
