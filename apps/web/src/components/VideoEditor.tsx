import React, { useCallback, useEffect, useRef, useState } from "react";

export interface EditorPause {
  id: string;
  atMs: number;
  holdMs: number;
}

interface VideoEditorProps {
  jobId: string;
  sourceVideoUrl: string;
  onEdited: (result: {
    videoUrl: string;
    durationMs: number;
  }) => void;
}

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, ms) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function createPauseId() {
  return `pause-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function VideoEditor({
  jobId,
  sourceVideoUrl,
  onEdited,
}: VideoEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [durationMs, setDurationMs] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [pauses, setPauses] = useState<EditorPause[]>([]);
  const [defaultHoldMs, setDefaultHoldMs] = useState(1500);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [dragTarget, setDragTarget] = useState<
    "trim-start" | "trim-end" | string | null
  >(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoaded = () => {
      const nextDuration = Math.round(video.duration * 1000);
      setDurationMs(nextDuration);
      setTrimEndMs(nextDuration);
      setTrimStartMs(0);
      setPauses([]);
      setCurrentMs(0);
    };

    const handleTimeUpdate = () => {
      setCurrentMs(Math.round(video.currentTime * 1000));
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [sourceVideoUrl]);

  const msFromClientX = useCallback(
    (clientX: number) => {
      const timeline = timelineRef.current;
      if (!timeline || durationMs <= 0) return 0;
      const rect = timeline.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(ratio * durationMs);
    },
    [durationMs],
  );

  const seekTo = (ms: number) => {
    const video = videoRef.current;
    if (!video || durationMs <= 0) return;
    const clamped = Math.min(durationMs, Math.max(0, ms));
    video.currentTime = clamped / 1000;
    setCurrentMs(clamped);
  };

  useEffect(() => {
    if (!dragTarget) return;

    const handleMove = (event: MouseEvent) => {
      const nextMs = msFromClientX(event.clientX);

      if (dragTarget === "trim-start") {
        setTrimStartMs(Math.min(nextMs, trimEndMs - 100));
        seekTo(nextMs);
        return;
      }

      if (dragTarget === "trim-end") {
        setTrimEndMs(Math.max(nextMs, trimStartMs + 100));
        seekTo(nextMs);
        return;
      }

      setPauses((current) =>
        current.map((pause) =>
          pause.id === dragTarget
            ? {
                ...pause,
                atMs: Math.min(
                  trimEndMs,
                  Math.max(trimStartMs, nextMs),
                ),
              }
            : pause,
        ),
      );
      seekTo(nextMs);
    };

    const handleUp = () => setDragTarget(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragTarget, msFromClientX, trimEndMs, trimStartMs]);

  const addPauseAtPlayhead = () => {
    const atMs = Math.min(trimEndMs, Math.max(trimStartMs, currentMs));
    setPauses((current) => [
      ...current,
      { id: createPauseId(), atMs, holdMs: defaultHoldMs },
    ]);
  };

  const removePause = (id: string) => {
    setPauses((current) => current.filter((pause) => pause.id !== id));
  };

  const updatePauseHold = (id: string, holdMs: number) => {
    setPauses((current) =>
      current.map((pause) =>
        pause.id === id
          ? { ...pause, holdMs: Math.min(30000, Math.max(100, holdMs)) }
          : pause,
      ),
    );
  };

  const estimatedOutputMs =
    trimEndMs -
    trimStartMs +
    pauses.reduce((total, pause) => total + pause.holdMs, 0);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError("");

    try {
      const res = await fetch("/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          trimStartMs,
          trimEndMs,
          pauses: pauses.map(({ atMs, holdMs }) => ({ atMs, holdMs })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Export failed");
      }
      onEdited({
        videoUrl: `${data.videoUrl}?t=${Date.now()}`,
        durationMs: data.durationMs,
      });
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Export failed",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const percent = (ms: number) =>
    durationMs > 0 ? (ms / durationMs) * 100 : 0;

  return (
    <section className="editor-panel">
      <div className="editor-header">
        <div>
          <div className="panel-title">Video Editor</div>
          <p className="editor-subtitle">
            Trim the capture, add pause holds, then export a new MP4. The
            original recording is kept unchanged.
          </p>
        </div>
        <button
          type="button"
          className="editor-export-btn"
          onClick={handleExport}
          disabled={isExporting || durationMs <= 0}
        >
          {isExporting ? "Exporting..." : "Export edited video"}
        </button>
      </div>

      <div className="editor-preview">
        <video
          ref={videoRef}
          src={sourceVideoUrl}
          controls
          playsInline
          className="editor-video"
        />
      </div>

      {durationMs > 0 && (
        <>
          <div className="editor-time-row">
            <span>{formatTime(currentMs)}</span>
            <span>
              Trim {formatTime(trimStartMs)} – {formatTime(trimEndMs)}
            </span>
            <span>Est. export {formatTime(estimatedOutputMs)}</span>
          </div>

          <div
            ref={timelineRef}
            className="editor-timeline"
            onClick={(event) => {
              if (dragTarget) return;
              seekTo(msFromClientX(event.clientX));
            }}
          >
            <div className="editor-timeline-track" />
            <div
              className="editor-timeline-trim"
              style={{
                left: `${percent(trimStartMs)}%`,
                width: `${percent(trimEndMs - trimStartMs)}%`,
              }}
            />
            <div
              className="editor-playhead"
              style={{ left: `${percent(currentMs)}%` }}
            />
            {pauses.map((pause) => (
              <button
                key={pause.id}
                type="button"
                className="editor-pause-marker"
                style={{ left: `${percent(pause.atMs)}%` }}
                title={`Pause ${formatTime(pause.atMs)} for ${(pause.holdMs / 1000).toFixed(1)}s`}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  setDragTarget(pause.id);
                }}
                onClick={(event) => event.stopPropagation()}
              />
            ))}
            <button
              type="button"
              className="editor-trim-handle editor-trim-handle-start"
              style={{ left: `${percent(trimStartMs)}%` }}
              aria-label="Trim start"
              onMouseDown={(event) => {
                event.stopPropagation();
                setDragTarget("trim-start");
              }}
              onClick={(event) => event.stopPropagation()}
            />
            <button
              type="button"
              className="editor-trim-handle editor-trim-handle-end"
              style={{ left: `${percent(trimEndMs)}%` }}
              aria-label="Trim end"
              onMouseDown={(event) => {
                event.stopPropagation();
                setDragTarget("trim-end");
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </div>

          <div className="editor-controls">
            <button
              type="button"
              className="editor-secondary-btn"
              onClick={addPauseAtPlayhead}
            >
              Add pause at playhead
            </button>
            <label className="editor-hold-field">
              Default hold
              <input
                type="number"
                min={100}
                max={30000}
                step={100}
                value={defaultHoldMs}
                onChange={(event) =>
                  setDefaultHoldMs(
                    Math.min(
                      30000,
                      Math.max(100, Number(event.target.value) || 1500),
                    ),
                  )
                }
              />
              <span>ms</span>
            </label>
          </div>

          {pauses.length > 0 && (
            <ul className="editor-pause-list">
              {pauses
                .slice()
                .sort((a, b) => a.atMs - b.atMs)
                .map((pause) => (
                  <li key={pause.id} className="editor-pause-item">
                    <span>{formatTime(pause.atMs)}</span>
                    <label>
                      Hold
                      <input
                        type="number"
                        min={100}
                        max={30000}
                        step={100}
                        value={pause.holdMs}
                        onChange={(event) =>
                          updatePauseHold(
                            pause.id,
                            Number(event.target.value) || 1500,
                          )
                        }
                      />
                      ms
                    </label>
                    <button
                      type="button"
                      className="editor-remove-btn"
                      onClick={() => removePause(pause.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}

      {exportError && <p className="status error">{exportError}</p>}
    </section>
  );
}
