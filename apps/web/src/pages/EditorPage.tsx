import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EditorTimeline from "../components/EditorTimeline";
import {
  buildTimelineBlocks,
  exportMsToPlayback,
  getExportDurationMs,
  sourceMsToExportMs,
} from "../lib/editorTimeline";

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
  const exportMsRef = useRef(0);
  const blocksRef = useRef<ReturnType<typeof buildTimelineBlocks>>([]);
  const exportDurationMsRef = useRef(0);

  const [sourceDurationMs, setSourceDurationMs] = useState(0);
  const [exportMs, setExportMs] = useState(0);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [pauses, setPauses] = useState<EditorPause[]>([]);
  const [selectedPauseId, setSelectedPauseId] = useState<string | null>(null);
  const [defaultHoldMs, setDefaultHoldMs] = useState(1500);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState<"edit" | "export">("edit");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);

  const selectedPause = pauses.find((pause) => pause.id === selectedPauseId);

  const blocks = useMemo(
    () => buildTimelineBlocks(trimStartMs, trimEndMs, pauses),
    [trimStartMs, trimEndMs, pauses],
  );

  const exportDurationMs = useMemo(() => getExportDurationMs(blocks), [blocks]);

  blocksRef.current = blocks;
  exportDurationMsRef.current = exportDurationMs;
  exportMsRef.current = exportMs;

  const activeVideoUrl =
    previewMode === "export" && exportedUrl ? exportedUrl : sourceVideoUrl;

  const sourceMsFromClientX = useCallback(
    (clientX: number) => {
      const timeline = timelineRef.current;
      if (!timeline || sourceDurationMs <= 0) return 0;
      const rect = timeline.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      return Math.round(ratio * sourceDurationMs);
    },
    [sourceDurationMs],
  );

  const exportMsFromClientX = useCallback(
    (clientX: number) => {
      const timeline = timelineRef.current;
      if (!timeline || exportDurationMs <= 0) return 0;
      const rect = timeline.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      return Math.round(ratio * exportDurationMs);
    },
    [exportDurationMs],
  );

  const syncVideoToExportMs = useCallback(
    (nextExportMs: number) => {
      const video = videoRef.current;
      const duration = exportDurationMsRef.current;
      if (!video || previewMode !== "edit" || duration <= 0) return;

      const clamped = Math.min(duration, Math.max(0, nextExportMs));
      const { sourceMs } = exportMsToPlayback(clamped, blocksRef.current);
      video.pause();
      video.currentTime = sourceMs / 1000;
      exportMsRef.current = clamped;
      setExportMs(clamped);
    },
    [previewMode],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoaded = () => {
      const nextDuration = Math.round(video.duration * 1000);
      setSourceDurationMs(nextDuration);
      setTrimEndMs(nextDuration);
      setTrimStartMs(0);
      setPauses([]);
      setSelectedPauseId(null);
      exportMsRef.current = 0;
      setExportMs(0);
      setExportedUrl(null);
      setPreviewMode("edit");
    };

    const handleTimeUpdate = () => {
      if (previewMode !== "export") return;
      setExportMs(Math.round(video.currentTime * 1000));
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [activeVideoUrl, previewMode]);

  useEffect(() => {
    if (!isPlaying || previewMode !== "edit" || exportDurationMs <= 0) {
      return;
    }

    let frameId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;

      const duration = exportDurationMsRef.current;
      let next = exportMsRef.current + delta;

      if (next >= duration) {
        next = duration;
        setIsPlaying(false);
      }

      const video = videoRef.current;
      if (video) {
        const { sourceMs } = exportMsToPlayback(next, blocksRef.current);
        video.pause();
        video.currentTime = sourceMs / 1000;
      }

      exportMsRef.current = next;
      setExportMs(next);

      if (next < duration) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, previewMode, exportDurationMs]);

  useEffect(() => {
    if (exportMs > exportDurationMs) {
      syncVideoToExportMs(exportDurationMs);
    }
  }, [exportDurationMs, exportMs, syncVideoToExportMs]);

  useEffect(() => {
    if (!isPlaying && previewMode === "edit" && exportDurationMs > 0) {
      syncVideoToExportMs(exportMsRef.current);
    }
  }, [blocks, isPlaying, previewMode, exportDurationMs, syncVideoToExportMs]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (previewMode === "export") {
      if (video.paused) void video.play();
      else video.pause();
      setIsPlaying(!video.paused);
      return;
    }

    if (isPlaying) {
      setIsPlaying(false);
      video.pause();
      return;
    }

    if (exportMsRef.current >= exportDurationMs) {
      syncVideoToExportMs(0);
    }
    setIsPlaying(true);
  }, [exportDurationMs, isPlaying, previewMode, syncVideoToExportMs]);

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
      if (dragTarget === "trim-start") {
        const next = Math.min(
          sourceMsFromClientX(event.clientX),
          trimEndMs - 100,
        );
        setTrimStartMs(Math.max(0, next));
        syncVideoToExportMs(sourceMsToExportMs(next, blocks));
        return;
      }

      if (dragTarget === "trim-end") {
        const next = Math.max(
          sourceMsFromClientX(event.clientX),
          trimStartMs + 100,
        );
        setTrimEndMs(Math.min(sourceDurationMs, next));
        syncVideoToExportMs(
          sourceMsToExportMs(Math.min(sourceDurationMs, next), blocks),
        );
        return;
      }

      if (dragTarget.startsWith("resize-")) {
        const pauseId = dragTarget.slice("resize-".length);
        const block = blocks.find((entry) => entry.pauseId === pauseId);
        if (!block) return;
        const exportAtX = exportMsFromClientX(event.clientX);
        const nextHold = Math.min(
          30000,
          Math.max(100, exportAtX - block.exportStartMs),
        );
        setPauses((current) =>
          current.map((pause) =>
            pause.id === pauseId ? { ...pause, holdMs: nextHold } : pause,
          ),
        );
        return;
      }

      const pauseId = dragTarget;
      const nextAt = Math.min(
        trimEndMs,
        Math.max(trimStartMs, sourceMsFromClientX(event.clientX)),
      );
      setPauses((current) =>
        current.map((pause) =>
          pause.id === pauseId ? { ...pause, atMs: nextAt } : pause,
        ),
      );
      syncVideoToExportMs(sourceMsToExportMs(nextAt, blocks));
    };

    const handleUp = () => setDragTarget(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    blocks,
    dragTarget,
    exportMsFromClientX,
    sourceDurationMs,
    sourceMsFromClientX,
    syncVideoToExportMs,
    trimEndMs,
    trimStartMs,
  ]);

  const addPauseAtPlayhead = () => {
    const { sourceMs } = exportMsToPlayback(exportMsRef.current, blocks);
    const atMs = Math.min(trimEndMs, Math.max(trimStartMs, sourceMs));
    const id = createPauseId();
    setPauses((current) => [...current, { id, atMs, holdMs: defaultHoldMs }]);
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
      const nextUrl = `${data.videoUrl}?t=${Date.now()}`;
      setExportedUrl(nextUrl);
      setPreviewMode("export");
      setIsPlaying(false);
      setExportMs(0);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const skipBy = (deltaMs: number) => {
    if (previewMode === "export") {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.max(
        0,
        Math.min(video.duration, video.currentTime + deltaMs / 1000),
      );
      return;
    }
    syncVideoToExportMs(exportMsRef.current + deltaMs);
  };

  return (
    <div className="editor-workspace">
      <header className="editor-topbar">
        <div className="editor-topbar-left">
          <button type="button" className="editor-back-btn" onClick={onBack}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
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
              {scrollStrategy === "virtual"
                ? "Virtual scroll"
                : "Document scroll"}
            </span>
          )}
          <span className="editor-chip">
            {width}×{height}
          </span>
          {exportedUrl && (
            <div className="editor-preview-toggle">
              <button
                type="button"
                className={previewMode === "edit" ? "is-active" : ""}
                onClick={() => {
                  setPreviewMode("edit");
                  setIsPlaying(false);
                  syncVideoToExportMs(exportMsRef.current);
                }}
              >
                Edit preview
              </button>
              <button
                type="button"
                className={previewMode === "export" ? "is-active" : ""}
                onClick={() => {
                  setPreviewMode("export");
                  setIsPlaying(false);
                }}
              >
                Export preview
              </button>
            </div>
          )}
          {exportedUrl ? (
            <a
              className="editor-download-btn"
              href={exportedUrl}
              download="recording-edited.mp4"
            >
              Download export
            </a>
          ) : (
            <span className="editor-unsaved">Unsaved edits</span>
          )}
          <button
            type="button"
            className="editor-export-btn"
            onClick={handleExport}
            disabled={isExporting || sourceDurationMs <= 0}
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
              disabled={sourceDurationMs <= 0 || previewMode === "export"}
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
                <p>
                  Select a pause block on the timeline, or add one at the
                  playhead.
                </p>
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
              Orange blocks are pause holds in the exported video. Drag a
              block&apos;s right edge to change hold length. Press{" "}
              <kbd>Space</kbd> to preview.
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
              key={activeVideoUrl}
              src={activeVideoUrl}
              playsInline
              className="editor-monitor-video"
              onClick={togglePlayback}
            />
            {!isPlaying && sourceDurationMs > 0 && (
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
            >
              −1s
            </button>
            <button
              type="button"
              className="editor-transport-btn editor-transport-btn-primary"
              onClick={togglePlayback}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className="editor-transport-btn"
              onClick={() => skipBy(1000)}
            >
              +1s
            </button>
            <div className="editor-timecode">
              <span className="editor-timecode-current">
                {formatTime(previewMode === "export" ? exportMs : exportMs)}
              </span>
              <span className="editor-timecode-sep">/</span>
              <span className="editor-timecode-duration">
                {formatTime(
                  previewMode === "export" && videoRef.current
                    ? Math.round(videoRef.current.duration * 1000) ||
                        exportDurationMs
                    : exportDurationMs,
                )}
              </span>
            </div>
            {previewMode === "edit" && (
              <span className="editor-timecode editor-timecode-mode">
                Edit preview
              </span>
            )}
          </div>
        </main>
      </div>

      <footer className="editor-timeline-panel">
        <div className="editor-timeline-toolbar">
          <span className="editor-timeline-title">Timeline</span>
          <span className="editor-timeline-meta">
            Source {formatTime(trimStartMs)}–{formatTime(trimEndMs)} · Export{" "}
            {formatTime(exportDurationMs)}
            {pauses.length > 0 &&
              ` · ${pauses.length} pause${pauses.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {sourceDurationMs > 0 && previewMode === "edit" && (
          <EditorTimeline
            blocks={blocks}
            exportDurationMs={exportDurationMs}
            exportMs={exportMs}
            selectedPauseId={selectedPauseId}
            dragTarget={dragTarget}
            timelineRef={timelineRef}
            onSeekExport={syncVideoToExportMs}
            onTrimStartDrag={() => setDragTarget("trim-start")}
            onTrimEndDrag={() => setDragTarget("trim-end")}
            onPauseDrag={(pauseId) => {
              setDragTarget(pauseId);
              setSelectedPauseId(pauseId);
            }}
            onPauseResize={(pauseId) => {
              setDragTarget(`resize-${pauseId}`);
              setSelectedPauseId(pauseId);
            }}
            onSelectPause={(pauseId) => {
              setSelectedPauseId(pauseId);
              const pause = pauses.find((entry) => entry.id === pauseId);
              if (pause)
                syncVideoToExportMs(sourceMsToExportMs(pause.atMs, blocks));
            }}
          />
        )}

        {previewMode === "export" && exportedUrl && (
          <p className="editor-export-note">
            Viewing rendered export. Switch to Edit preview to adjust pauses and
            trim.
          </p>
        )}
      </footer>

      {exportError && (
        <div className="editor-toast editor-toast-error">{exportError}</div>
      )}
      {exportedUrl && !exportError && previewMode === "export" && (
        <div className="editor-toast editor-toast-success">
          Export rendered with pause holds baked in.
        </div>
      )}
    </div>
  );
}
