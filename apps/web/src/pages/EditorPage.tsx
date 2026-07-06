import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AppTopbar from "../components/AppTopbar";
import LordIcon from "../components/LordIcon";
import EditorTimeline, {
  type EditorTimelineHandle,
} from "../timeline/components/EditorTimeline";
import { usePauseDrag } from "../timeline/hooks/use-pause-drag";
import { usePlaybackClock } from "../timeline/hooks/use-playback-clock";
import { useTimelineSeek } from "../timeline/hooks/use-timeline-seek";
import { useTrimDrag } from "../timeline/hooks/use-trim-drag";
import { MAX_HOLD_MS, MIN_HOLD_MS } from "../timeline/utils";
import {
  buildTimelineBlocks,
  clampSourceMs,
  exportMsToPlayback,
  exportMsToSourceMs,
  getExportDurationMs,
  sourceMsToExportMs,
} from "../lib/editorTimeline";
import { LORDICON } from "../lib/icons";

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
  onNavigate: (path: string) => void;
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
  onNavigate,
}: EditorPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineHandleRef = useRef<EditorTimelineHandle>(null);
  const exportMsRef = useRef(0);
  const blocksRef = useRef<ReturnType<typeof buildTimelineBlocks>>([]);
  const exportDurationMsRef = useRef(0);
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
  const isPlayingRef = useRef(false);
  const [previewMode, setPreviewMode] = useState<"edit" | "export">("edit");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);

  const selectedPause = pauses.find((pause) => pause.id === selectedPauseId);

  const seekToExportMsRef = useRef<(ms: number) => void>(() => {});
  const stopPlaybackRef = useRef<() => void>(() => {});

  const trimDrag = useTrimDrag({
    timelineRef,
    trimStartMs,
    trimEndMs,
    sourceDurationMsRef,
    trimStartMsRef,
    trimEndMsRef,
    pausesRef,
    blocksRef,
    exportMsRef,
    setTrimStartMs,
    setTrimEndMs,
    seekToExportMs: (ms) => seekToExportMsRef.current(ms),
    stopPlayback: () => stopPlaybackRef.current(),
  });

  const displayTrimStartMs = trimDrag.displayTrimStartMs;
  const displayTrimEndMs = trimDrag.displayTrimEndMs;

  const pauseDrag = usePauseDrag({
    timelineRef,
    sourceDurationMsRef,
    trimStartMsRef,
    trimEndMsRef,
    pausesRef,
    blocksRef,
    setPauses,
    seekToExportMs: (ms) => seekToExportMsRef.current(ms),
    stopPlayback: () => stopPlaybackRef.current(),
    onSelectPause: setSelectedPauseId,
  });

  const effectivePauses = pauseDrag.previewPauses ?? pauses;

  const blocks = useMemo(
    () =>
      buildTimelineBlocks(
        displayTrimStartMs,
        displayTrimEndMs,
        effectivePauses,
      ),
    [displayTrimEndMs, displayTrimStartMs, effectivePauses],
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

  const handlePlayheadUpdate = useCallback((percent: number) => {
    timelineHandleRef.current?.setPlayheadPercent(percent);
  }, []);

  const {
    seekToExportMs,
    startPlayback,
    pausePlayback,
    handleTimeUpdate: handleEditTimeUpdate,
    stopPlayback,
    updatePlayhead,
  } = usePlaybackClock({
    videoRef,
    blocksRef,
    exportDurationMsRef,
    exportMsRef,
    sourceDurationMsRef,
    setExportMs,
    previewMode,
    isPlaying,
    setIsPlaying,
    onPlayheadUpdate: handlePlayheadUpdate,
  });

  seekToExportMsRef.current = seekToExportMs;
  stopPlaybackRef.current = stopPlayback;

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const isInteractionBlocked = useCallback(
    () => trimDrag.isDragging || pauseDrag.isDragging,
    [pauseDrag.isDragging, trimDrag.isDragging],
  );

  const timelineSeek = useTimelineSeek({
    timelineRef,
    sourceDurationMsRef,
    trimStartMsRef,
    trimEndMsRef,
    blocksRef,
    seekToExportMs,
    stopPlayback,
    isInteractionBlocked,
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
    if (previewMode !== "edit" || exportDurationMs <= 0 || isPlaying) return;

    const currentSource = exportMsToSourceMs(exportMsRef.current, blocks);
    const clampedSource = clampSourceMs(currentSource, trimStartMs, trimEndMs);
    const nextExport = Math.min(
      sourceMsToExportMs(clampedSource, blocks),
      exportDurationMs,
    );

    if (Math.abs(nextExport - exportMsRef.current) > 1) {
      seekToExportMs(nextExport);
    }
  }, [
    blocks,
    exportDurationMs,
    isPlaying,
    previewMode,
    seekToExportMs,
    trimEndMs,
    trimStartMs,
  ]);

  useEffect(() => {
    if (!isPlaying && !timelineSeek.isScrubbing) {
      updatePlayhead(exportMs);
    }
  }, [exportMs, isPlaying, timelineSeek.isScrubbing, updatePlayhead]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (previewMode === "export") {
      if (video.paused) void video.play();
      else video.pause();
      setIsPlaying(!video.paused);
      return;
    }

    if (isPlayingRef.current) {
      pausePlayback();
      return;
    }

    startPlayback();
  }, [previewMode, pausePlayback, startPlayback]);

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

  const addPauseAtPlayhead = () => {
    stopPlayback();
    const { sourceMs } = exportMsToPlayback(exportMsRef.current, blocks);
    const atMs = Math.min(trimEndMs, Math.max(trimStartMs, sourceMs));
    const id = createPauseId();
    const nextPauses = [
      ...pausesRef.current,
      { id, atMs, holdMs: defaultHoldMs },
    ];
    const nextBlocks = buildTimelineBlocks(trimStartMs, trimEndMs, nextPauses);
    setPauses(nextPauses);
    setSelectedPauseId(id);
    seekToExportMs(sourceMsToExportMs(atMs, nextBlocks));
  };

  const removePause = (id: string) => {
    setPauses((current) => current.filter((pause) => pause.id !== id));
    if (selectedPauseId === id) setSelectedPauseId(null);
  };

  const updatePauseHold = (id: string, holdMs: number) => {
    setPauses((current) =>
      current.map((pause) =>
        pause.id === id
          ? {
              ...pause,
              holdMs: Math.min(MAX_HOLD_MS, Math.max(MIN_HOLD_MS, holdMs)),
            }
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
    <main className="app-shell app-shell-editor">
      <AppTopbar
        currentPath="/editor"
        onNavigate={onNavigate}
        hasEditorSession
        actions={
          <>
            {scrollStrategy && (
              <span className={`product-chip product-chip-${scrollStrategy}`}>
                {scrollStrategy === "virtual" ? "Virtual" : "Document"}
              </span>
            )}
            <span className="product-chip">
              {width}×{height}
            </span>
            {exportedUrl && (
              <div className="product-segmented">
                <button
                  type="button"
                  className={previewMode === "edit" ? "is-active" : ""}
                  onClick={() => {
                    stopPlayback();
                    setPreviewMode("edit");
                    seekToExportMs(exportMsRef.current);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={previewMode === "export" ? "is-active" : ""}
                  onClick={() => {
                    stopPlayback();
                    setPreviewMode("export");
                  }}
                >
                  Export
                </button>
              </div>
            )}
            {exportedUrl ? (
              <a
                className="product-btn product-btn-ghost"
                href={exportedUrl}
                download="recording-edited.mp4"
              >
                Download
              </a>
            ) : (
              <span className="product-muted">Unsaved</span>
            )}
            <button
              type="button"
              className="product-btn product-btn-primary"
              onClick={handleExport}
              disabled={isExporting || sourceDurationMs <= 0}
            >
              {isExporting ? "Rendering…" : "Export MP4"}
            </button>
          </>
        }
      />

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
              <LordIcon src={LORDICON.select} size={18} trigger="hover" />
              Select
            </button>
            <button
              type="button"
              className="editor-tool-btn"
              onClick={addPauseAtPlayhead}
              disabled={sourceDurationMs <= 0 || previewMode === "export"}
            >
              <LordIcon src={LORDICON.pause} size={18} trigger="hover" />
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
                  Hold duration
                  <input
                    type="number"
                    min={MIN_HOLD_MS}
                    max={MAX_HOLD_MS}
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
                  Select a pause on the timeline, or add one at the playhead.
                </p>
                <label className="editor-inspector-field">
                  Default hold
                  <input
                    type="number"
                    min={MIN_HOLD_MS}
                    max={MAX_HOLD_MS}
                    step={100}
                    value={defaultHoldMs}
                    onChange={(event) =>
                      setDefaultHoldMs(
                        Math.min(
                          MAX_HOLD_MS,
                          Math.max(
                            MIN_HOLD_MS,
                            Number(event.target.value) || 1500,
                          ),
                        ),
                      )
                    }
                  />
                </label>
              </div>
            )}
          </section>
        </aside>

        <main className="editor-stage">
          <div className="editor-stage-label">
            <span className="editor-stage-eyebrow">Monitor</span>
            <span className="editor-stage-mode">
              {previewMode === "export" ? "Export" : "Edit"}
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
                {formatTime(exportMs)}
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
              <span className="editor-timecode editor-timecode-mode">Edit</span>
            )}
          </div>
        </main>
      </div>

      <footer className="editor-timeline-panel">
        <div className="editor-timeline-toolbar">
          <span className="editor-timeline-title">Timeline</span>
          <span className="editor-timeline-meta">
            Source {formatTime(displayTrimStartMs)}–
            {formatTime(displayTrimEndMs)} · Export{" "}
            {formatTime(exportDurationMs)}
            {pauses.length > 0 &&
              ` · ${pauses.length} pause${pauses.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {sourceDurationMs > 0 && previewMode === "edit" && (
          <EditorTimeline
            ref={timelineHandleRef}
            blocks={blocks}
            sourceDurationMs={sourceDurationMs}
            trimStartMs={displayTrimStartMs}
            trimEndMs={displayTrimEndMs}
            exportMs={exportMs}
            isPlaying={isPlaying}
            isScrubbing={timelineSeek.isScrubbing}
            selectedPauseId={selectedPauseId}
            trimDragHandle={trimDrag.dragHandle}
            pauseDragId={pauseDrag.dragPauseId}
            pauseDragMode={pauseDrag.dragMode}
            timelineRef={timelineRef}
            onTrackMouseDown={timelineSeek.startTrackSeek}
            onPlayheadMouseDown={timelineSeek.startPlayheadScrub}
            onTrimStartDrag={trimDrag.startTrimStartDrag}
            onTrimEndDrag={trimDrag.startTrimEndDrag}
            onPauseDrag={pauseDrag.startMoveDrag}
            onPauseResize={pauseDrag.startResizeDrag}
            onSelectPause={(pauseId) => {
              setSelectedPauseId(pauseId);
              const pause = effectivePauses.find(
                (entry) => entry.id === pauseId,
              );
              if (pause) {
                seekToExportMs(sourceMsToExportMs(pause.atMs, blocks));
              }
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
    </main>
  );
}
