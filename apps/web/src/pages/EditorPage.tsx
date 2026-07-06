import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface EditorPause {
  id: string;
  atMs: number;
  holdMs: number;
}

interface EditorPageProps {
  jobId: string;
  sourceVideoUrl: string;
  targetUrl: string;
  width: number;
  height: number;
  scrollStrategy?: "document" | "virtual";
  onBack: () => void;
}

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, ms) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function createPauseId() {
  return `pause-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function EditorPage({
  jobId,
  sourceVideoUrl,
  targetUrl,
  width,
  height,
  scrollStrategy,
  onBack,
}: EditorPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [durationMs, setDurationMs] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [pauses, setPauses] = useState<EditorPause[]>([]);
  const [selectedPauseId, setSelectedPauseId] = useState<string | null>(null);
  const [defaultHoldMs, setDefaultHoldMs] = useState(1500);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<
    "trim-start" | "trim-end" | string | null
  >(null);

  const selectedPause = pauses.find((pause) => pause.id === selectedPauseId);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoaded = () => {
      const nextDuration = Math.round(video.duration * 1000);
      setDurationMs(nextDuration);
      setTrimEndMs(nextDuration);
      setTrimStartMs(0);
      setPauses([]);
      setSelectedPauseId(null);
      setCurrentMs(0);
      setExportedUrl(null);
    };

    const handleTimeUpdate = () => {
      setCurrentMs(Math.round(video.currentTime * 1000));
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [sourceVideoUrl]);

  const msFromClientX = useCallback(
    (clientX: number) => {
      const timeline = timelineRef.current;
      if (!timeline || durationMs <= 0) return 0;
      const rect = timeline.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      return Math.round(ratio * durationMs);
    },
    [durationMs],
  );

  const seekTo = useCallback(
    (ms: number) => {
      const video = videoRef.current;
      if (!video || durationMs <= 0) return;
      const clamped = Math.min(durationMs, Math.max(0, ms));
      video.currentTime = clamped / 1000;
      setCurrentMs(clamped);
    },
    [durationMs],
  );

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayback]);

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
                atMs: Math.min(trimEndMs, Math.max(trimStartMs, nextMs)),
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
  }, [dragTarget, msFromClientX, seekTo, trimEndMs, trimStartMs]);

  const addPauseAtPlayhead = () => {
    const atMs = Math.min(trimEndMs, Math.max(trimStartMs, currentMs));
    const id = createPauseId();
    setPauses((current) => [
      ...current,
      { id, atMs, holdMs: defaultHoldMs },
    ]);
    setSelectedPauseId(id);
  };

  const removePause = (id: string) => {
    setPauses((current) => current.filter((pause) => pause.id !== id));
    if (selectedPauseId === id) setSelectedPauseId(null);
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
      setExportedUrl(`${data.videoUrl}?t=${Date.now()}`);
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

  const rulerMarks = useMemo(() => {
    if (durationMs <= 0) return [];
    const stepMs =
      durationMs > 60000 ? 10000 : durationMs > 20000 ? 5000 : 2000;
    const marks: number[] = [];
    for (let ms = 0; ms <= durationMs; ms += stepMs) {
      marks.push(ms);
    }
    return marks;
  }, [durationMs]);

  const skipBy = (deltaMs: number) => {
    seekTo(currentMs + deltaMs);
  };

  return (
    <div className="editor-workspace">
      <header className="editor-topbar">
        <div className="editor-topbar-left">
          <button type="button" className="editor-back-btn" onClick={onBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Recorder
          </button>
          <div className="editor-project-meta">
            <span className="editor-project-label">Editor</span>
            <span className="editor-project-url" title={targetUrl}>
              {targetUrl || "Untitled capture"}
            </span>
          </div>
        </div>

        <div className="editor-topbar-right">
          {scrollStrategy && (
            <span className={`editor-chip editor-chip-${scrollStrategy}`}>
              {scrollStrategy === "virtual" ? "Virtual scroll" : "Document scroll"}
            </span>
          )}
          <span className="editor-chip">{width}×{height}</span>
          {exportedUrl ? (
            <a className="editor-download-btn" href={exportedUrl} download="recording-edited.mp4">
              Download export
            </a>
          ) : (
            <span className="editor-unsaved">Unsaved edits</span>
          )}
          <button
            type="button"
            className="editor-export-btn"
            onClick={handleExport}
            disabled={isExporting || durationMs <= 0}
          >
            {isExporting ? "Rendering..." : "Export MP4"}
          </button>
        </div>
      </header>

      <div className="editor-body">
        <aside className="editor-sidebar">
          <section className="editor-sidebar-section">
            <h3>Tools</h3>
            <button
              type="button"
              className="editor-tool-btn editor-tool-btn-active"
            >
              <span className="editor-tool-icon">◎</span>
              Select
            </button>
            <button
              type="button"
              className="editor-tool-btn"
              onClick={addPauseAtPlayhead}
              disabled={durationMs <= 0}
            >
              <span className="editor-tool-icon">⏸</span>
              Add pause
            </button>
          </section>

          <section className="editor-sidebar-section">
            <h3>Inspector</h3>
            {selectedPause ? (
              <div className="editor-inspector-card">
                <div className="editor-inspector-row">
                  <span>Position</span>
                  <strong>{formatTime(selectedPause.atMs)}</strong>
                </div>
                <label className="editor-inspector-field">
                  Hold duration (ms)
                  <input
                    type="number"
                    min={100}
                    max={30000}
                    step={100}
                    value={selectedPause.holdMs}
                    onChange={(event) =>
                      updatePauseHold(
                        selectedPause.id,
                        Number(event.target.value) || 1500,
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="editor-inspector-delete"
                  onClick={() => removePause(selectedPause.id)}
                >
                  Delete pause
                </button>
              </div>
            ) : (
              <div className="editor-inspector-card editor-inspector-empty">
                <p>Click a pause marker on the timeline, or add one at the playhead.</p>
                <label className="editor-inspector-field">
                  Default hold (ms)
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
                </label>
              </div>
            )}
          </section>

          <section className="editor-sidebar-section editor-sidebar-hint">
            <p>
              Drag the white handles to trim. Orange dots are pause holds. Press{" "}
              <kbd>Space</kbd> to play or pause.
            </p>
          </section>
        </aside>

        <main className="editor-stage">
          <div
            className="editor-monitor"
            style={{ aspectRatio: `${width} / ${height}` }}
          >
            <video
              ref={videoRef}
              src={sourceVideoUrl}
              playsInline
              className="editor-monitor-video"
              onClick={togglePlayback}
            />
            {!isPlaying && durationMs > 0 && (
              <button
                type="button"
                className="editor-monitor-play"
                onClick={togglePlayback}
                aria-label="Play"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="8,5 19,12 8,19" />
                </svg>
              </button>
            )}
          </div>

          <div className="editor-transport">
            <button
              type="button"
              className="editor-transport-btn"
              onClick={() => skipBy(-1000)}
              aria-label="Back 1 second"
            >
              −1s
            </button>
            <button
              type="button"
              className="editor-transport-btn editor-transport-btn-primary"
              onClick={togglePlayback}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className="editor-transport-btn"
              onClick={() => skipBy(1000)}
              aria-label="Forward 1 second"
            >
              +1s
            </button>
            <div className="editor-timecode">
              <span className="editor-timecode-current">{formatTime(currentMs)}</span>
              <span className="editor-timecode-sep">/</span>
              <span className="editor-timecode-duration">{formatTime(durationMs)}</span>
            </div>
            <div className="editor-timecode editor-timecode-export">
              Export {formatTime(estimatedOutputMs)}
            </div>
          </div>
        </main>
      </div>

      <footer className="editor-timeline-panel">
        <div className="editor-timeline-toolbar">
          <span className="editor-timeline-title">Timeline</span>
          <span className="editor-timeline-meta">
            Trim {formatTime(trimStartMs)} – {formatTime(trimEndMs)}
          </span>
        </div>

        {durationMs > 0 && (
          <>
            <div className="editor-timeline-ruler">
              {rulerMarks.map((mark) => (
                <span
                  key={mark}
                  className="editor-ruler-tick"
                  style={{ left: `${percent(mark)}%` }}
                >
                  {formatTime(mark)}
                </span>
              ))}
            </div>

            <div className="editor-track-row">
              <div className="editor-track-label">Video</div>
              <div
                ref={timelineRef}
                className="editor-track"
                onClick={(event) => {
                  if (dragTarget) return;
                  seekTo(msFromClientX(event.clientX));
                }}
              >
                <div className="editor-track-clip" />
                <div
                  className="editor-track-mask editor-track-mask-left"
                  style={{ width: `${percent(trimStartMs)}%` }}
                />
                <div
                  className="editor-track-mask editor-track-mask-right"
                  style={{
                    left: `${percent(trimEndMs)}%`,
                    width: `${100 - percent(trimEndMs)}%`,
                  }}
                />
                <div
                  className="editor-track-active"
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
                    className={`editor-pause-marker${selectedPauseId === pause.id ? " is-selected" : ""}`}
                    style={{ left: `${percent(pause.atMs)}%` }}
                    title={`Pause ${formatTime(pause.atMs)} · ${(pause.holdMs / 1000).toFixed(1)}s hold`}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      setDragTarget(pause.id);
                      setSelectedPauseId(pause.id);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedPauseId(pause.id);
                      seekTo(pause.atMs);
                    }}
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
            </div>

            {pauses.length > 0 && (
              <div className="editor-pause-chips">
                {pauses
                  .slice()
                  .sort((a, b) => a.atMs - b.atMs)
                  .map((pause) => (
                    <button
                      key={pause.id}
                      type="button"
                      className={`editor-pause-chip${selectedPauseId === pause.id ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedPauseId(pause.id);
                        seekTo(pause.atMs);
                      }}
                    >
                      {formatTime(pause.atMs)} · {(pause.holdMs / 1000).toFixed(1)}s
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
      </footer>

      {exportError && (
        <div className="editor-toast editor-toast-error">{exportError}</div>
      )}
      {exportedUrl && !exportError && (
        <div className="editor-toast editor-toast-success">
          Export ready — use Download export in the toolbar.
        </div>
      )}
    </div>
  );
}
