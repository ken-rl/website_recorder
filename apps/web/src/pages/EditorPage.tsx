import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EditorTimeline from "../components/EditorTimeline";
import { useEditorPlayback } from "../hooks/useEditorPlayback";
import {
  buildTimelineBlocks,
  clampPauseAtMs,
  exportMsToPlayback,
  exportMsToSourceMs,
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
  const pauseDragOffsetRef = useRef(0);
  const didDragRef = useRef(false);
  const pausesRef = useRef<EditorPause[]>([]);
  const trimStartMsRef = useRef(0);
  const trimEndMsRef = useRef(0);
  const sourceDurationMsRef = useRef(0);

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
  pausesRef.current = pauses;
  trimStartMsRef.current = trimStartMs;
  trimEndMsRef.current = trimEndMs;
  sourceDurationMsRef.current = sourceDurationMs;

  const activeVideoUrl =
    previewMode === "export" && exportedUrl ? exportedUrl : sourceVideoUrl;

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

  const sourceMsFromExportClientX = useCallback(
    (clientX: number) => {
      return exportMsToSourceMs(
        exportMsFromClientX(clientX),
        blocksRef.current,
      );
    },
    [exportMsFromClientX],
  );

  const {
    seekToExportMs,
    startPlayback,
    pausePlayback,
    handleTimeUpdate: handleEditTimeUpdate,
    stopPlayback,
  } = useEditorPlayback({
    videoRef,
    blocksRef,
    exportDurationMsRef,
    exportMsRef,
    setExportMs,
    previewMode,
    isPlaying,
    setIsPlaying,
  });

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
      if (previewMode === "export") {
        setExportMs(Math.round(video.currentTime * 1000));
        return;
      }
      handleEditTimeUpdate();
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [activeVideoUrl, previewMode, handleEditTimeUpdate]);

  useEffect(() => {
    if (exportMs > exportDurationMs) {
      seekToExportMs(exportDurationMs);
    }
  }, [exportDurationMs, exportMs, seekToExportMs]);

  useEffect(() => {
    if (!isPlaying && previewMode === "edit" && exportDurationMs > 0) {
      seekToExportMs(exportMsRef.current);
    }
  }, [blocks, isPlaying, previewMode, exportDurationMs, seekToExportMs]);

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
      pausePlayback();
      return;
    }

    startPlayback();
  }, [isPlaying, previewMode, pausePlayback, startPlayback]);

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
      didDragRef.current = true;

      if (dragTarget === "trim-start") {
        const next = Math.min(
          sourceMsFromExportClientX(event.clientX),
          trimEndMsRef.current - 100,
        );
        const trimStart = Math.max(0, next);
        setTrimStartMs(trimStart);
        const nextBlocks = buildTimelineBlocks(
          trimStart,
          trimEndMsRef.current,
          pausesRef.current,
        );
        seekToExportMs(sourceMsToExportMs(trimStart, nextBlocks));
        return;
      }

      if (dragTarget === "trim-end") {
        const next = Math.max(
          sourceMsFromExportClientX(event.clientX),
          trimStartMsRef.current + 100,
        );
        const trimEnd = Math.min(sourceDurationMsRef.current, next);
        setTrimEndMs(trimEnd);
        const nextBlocks = buildTimelineBlocks(
          trimStartMsRef.current,
          trimEnd,
          pausesRef.current,
        );
        seekToExportMs(sourceMsToExportMs(trimEnd, nextBlocks));
        return;
      }

      if (dragTarget.startsWith("resize-")) {
        const pauseId = dragTarget.slice("resize-".length);
        const block = blocksRef.current.find(
          (entry) => entry.pauseId === pauseId,
        );
        if (!block) return;
        const exportAtX = exportMsFromClientX(event.clientX);
        const nextHold = Math.min(
          30000,
          Math.max(100, exportAtX - block.exportStartMs),
        );
        const nextPauses = pausesRef.current.map((pause) =>
          pause.id === pauseId ? { ...pause, holdMs: nextHold } : pause,
        );
        pausesRef.current = nextPauses;
        setPauses(nextPauses);
        return;
      }

      const pauseId = dragTarget;
      const nextAt = clampPauseAtMs(
        sourceMsFromExportClientX(event.clientX) + pauseDragOffsetRef.current,
        pauseId,
        trimStartMsRef.current,
        trimEndMsRef.current,
        pausesRef.current,
      );
      const nextPauses = pausesRef.current.map((pause) =>
        pause.id === pauseId ? { ...pause, atMs: nextAt } : pause,
      );
      const nextBlocks = buildTimelineBlocks(
        trimStartMsRef.current,
        trimEndMsRef.current,
        nextPauses,
      );
      pausesRef.current = nextPauses;
      blocksRef.current = nextBlocks;
      setPauses(nextPauses);
      seekToExportMs(sourceMsToExportMs(nextAt, nextBlocks));
    };

    const handleUp = () => {
      setDragTarget(null);
      pauseDragOffsetRef.current = 0;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    dragTarget,
    exportMsFromClientX,
    sourceMsFromExportClientX,
    seekToExportMs,
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
    seekToExportMs(exportMsRef.current + deltaMs);
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
                  stopPlayback();
                  setPreviewMode("edit");
                  seekToExportMs(exportMsRef.current);
                }}
              >
                Edit preview
              </button>
              <button
                type="button"
                className={previewMode === "export" ? "is-active" : ""}
                onClick={() => {
                  stopPlayback();
                  setPreviewMode("export");
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
          <div className="editor-sidebar-intro">
            <span className="editor-sidebar-eyebrow">Project</span>
            <p className="editor-sidebar-url" title={targetUrl}>
              {targetUrl || "Untitled capture"}
            </p>
            <div className="editor-sidebar-stats">
              <span>
                {width}×{height}
              </span>
              {scrollStrategy && (
                <span className={`editor-chip editor-chip-${scrollStrategy}`}>
                  {scrollStrategy === "virtual" ? "Virtual" : "Document"}
                </span>
              )}
            </div>
          </div>

          <section className="editor-sidebar-section">
            <h3>Tools</h3>
            <button
              type="button"
              className="editor-tool-btn editor-tool-btn-active"
            >
              <span className="editor-tool-icon" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                  <path d="M13 13l6 6" />
                </svg>
              </span>
              Select
            </button>
            <button
              type="button"
              className="editor-tool-btn"
              onClick={addPauseAtPlayhead}
              disabled={sourceDurationMs <= 0 || previewMode === "export"}
            >
              <span className="editor-tool-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              </span>
              Add pause
              <kbd className="editor-tool-kbd">P</kbd>
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
              Orange blocks are pause holds in the exported video. Drag a block
              to move it, or drag the right edge to change hold length. Press{" "}
              <kbd>Space</kbd> to preview.
            </p>
          </section>
        </aside>

        <main className="editor-stage">
          <div className="editor-stage-label">
            <span className="editor-stage-eyebrow">Program monitor</span>
            <span className="editor-stage-mode">
              {previewMode === "export" ? "Export preview" : "Edit preview"}
            </span>
          </div>
          <div
            className="editor-monitor"
            style={{ aspectRatio: `${width} / ${height}` }}
          >
            <video
              ref={videoRef}
              key={activeVideoUrl}
              src={activeVideoUrl}
              playsInline
              preload="auto"
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
            onSeekExport={(exportMs) => {
              if (didDragRef.current) {
                didDragRef.current = false;
                return;
              }
              seekToExportMs(exportMs);
            }}
            onTrimStartDrag={() => setDragTarget("trim-start")}
            onTrimEndDrag={() => setDragTarget("trim-end")}
            onPauseDrag={(pauseId, clientX) => {
              const pause = pauses.find((entry) => entry.id === pauseId);
              if (!pause) return;
              stopPlayback();
              pauseDragOffsetRef.current =
                pause.atMs - sourceMsFromExportClientX(clientX);
              setDragTarget(pauseId);
              setSelectedPauseId(pauseId);
            }}
            onPauseResize={(pauseId) => {
              stopPlayback();
              setDragTarget(`resize-${pauseId}`);
              setSelectedPauseId(pauseId);
            }}
            onSelectPause={(pauseId) => {
              setSelectedPauseId(pauseId);
              const pause = pauses.find((entry) => entry.id === pauseId);
              if (pause) seekToExportMs(sourceMsToExportMs(pause.atMs, blocks));
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
