import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AppTopbar from "../components/AppTopbar";
import BezierVisualizer, { CURVES } from "../components/BezierVisualizer";
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

interface EditorZoom {
  id: string;
  atMs: number;
  durationMs: number;
  scale: number;
  x: number;
  y: number;
}

interface ZoomBoxOverlayProps {
  zoom: EditorZoom;
  onChange: (updates: Partial<Omit<EditorZoom, "id">>) => void;
}

function ZoomBoxOverlay({ zoom, onChange }: ZoomBoxOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current?.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startZoomX = zoom.x;
    const startZoomY = zoom.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / rect.width;
      const deltaY = (moveEvent.clientY - startY) / rect.height;

      const halfSize = 0.5 / zoom.scale;
      const minVal = halfSize;
      const maxVal = 1 - halfSize;

      const nextX = Math.max(minVal, Math.min(maxVal, startZoomX + deltaX));
      const nextY = Math.max(minVal, Math.min(maxVal, startZoomY + deltaY));

      onChange({ x: nextX, y: nextY });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleMouseDownResize = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current?.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startZoomScale = zoom.scale;
    const startZoomX = zoom.x;
    const startZoomY = zoom.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const factor = corner === "se" || corner === "ne" ? 1 : -1;
      const deltaPercent = (deltaX / rect.width) * factor * 2;

      const currentWPercent = 1 / startZoomScale;
      const nextWPercent = Math.max(
        0.25,
        Math.min(1.0, currentWPercent + deltaPercent),
      );
      const nextScale = Math.max(1.0, Math.min(4.0, 1 / nextWPercent));

      const halfSize = 0.5 / nextScale;
      const nextX = Math.max(halfSize, Math.min(1 - halfSize, startZoomX));
      const nextY = Math.max(halfSize, Math.min(1 - halfSize, startZoomY));

      onChange({ scale: nextScale, x: nextX, y: nextY });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const boxW = 100 / zoom.scale;
  const boxH = 100 / zoom.scale;
  const boxL = (zoom.x - 0.5 / zoom.scale) * 100;
  const boxT = (zoom.y - 0.5 / zoom.scale) * 100;

  return (
    <div
      ref={containerRef}
      className="zoom-box-overlay"
      style={{
        width: `${boxW}%`,
        height: `${boxH}%`,
        left: `${boxL}%`,
        top: `${boxT}%`,
      }}
      onMouseDown={handleMouseDownDrag}
    >
      <div className="zoom-box-label">Zoom {zoom.scale.toFixed(1)}x</div>
      <div
        className="zoom-box-handle zoom-box-handle-nw"
        onMouseDown={(e) => handleMouseDownResize(e, "nw")}
      />
      <div
        className="zoom-box-handle zoom-box-handle-ne"
        onMouseDown={(e) => handleMouseDownResize(e, "ne")}
      />
      <div
        className="zoom-box-handle zoom-box-handle-sw"
        onMouseDown={(e) => handleMouseDownResize(e, "sw")}
      />
      <div
        className="zoom-box-handle zoom-box-handle-se"
        onMouseDown={(e) => handleMouseDownResize(e, "se")}
      />
    </div>
  );
}

interface EditorPageProps {
  jobId: string;
  sourceVideoUrl: string;
  targetUrl: string;
  width: number;
  height: number;
  scrollStrategy?: "document" | "virtual";
  onNavigate: (path: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
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
  theme,
  onToggleTheme,
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
  const [zooms, setZooms] = useState<EditorZoom[]>([]);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [defaultHoldMs, setDefaultHoldMs] = useState(1500);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [previewMode, setPreviewMode] = useState<"edit" | "export">("edit");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);

  const [hasMetadata, setHasMetadata] = useState(false);
  const [metaInitialDurationMs, setMetaInitialDurationMs] = useState(0);
  const [activePopover, setActivePopover] = useState<"curve" | "speed" | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [curvePreset, setCurvePreset] = useState("ease-in-out");
  const [customBezier, setCustomBezier] = useState<[number, number, number, number]>([0.25, 0.1, 0.25, 1.0]);

  useEffect(() => {
    fetch(`/outputs/${jobId}/frames-metadata.json`)
      .then((res) => {
        if (res.ok) {
          setHasMetadata(true);
          return res.json();
        }
        return null;
      })
      .then((meta) => {
        if (meta) {
          const initialDuration = Math.round((meta.frames.length / 60) * 1000);
          setDurationMs(initialDuration);
          setMetaInitialDurationMs(initialDuration);
        }
      })
      .catch(() => {});
  }, [jobId]);

  useEffect(() => {
    if (hasMetadata && durationMs > 0) {
      setSourceDurationMs(durationMs);
      sourceDurationMsRef.current = durationMs;
      if (trimEndMs === 0 || trimEndMs > durationMs) {
        setTrimEndMs(durationMs);
        trimEndMsRef.current = durationMs;
      }
    }
  }, [hasMetadata, durationMs]);

  const handleDurationChange = (newVal: number) => {
    const nextDurationMs = newVal * 1000;
    setDurationMs(nextDurationMs);

    setPauses((current) =>
      current
        .filter((p) => p.atMs < nextDurationMs)
        .map((p) => {
          if (p.atMs + p.holdMs > nextDurationMs) {
            return { ...p, holdMs: nextDurationMs - p.atMs };
          }
          return p;
        })
    );

    setZooms((current) =>
      current
        .filter((z) => z.atMs < nextDurationMs)
        .map((z) => {
          if (z.atMs + z.durationMs > nextDurationMs) {
            return { ...z, durationMs: nextDurationMs - z.atMs };
          }
          return z;
        })
    );

    if (trimEndMs > nextDurationMs) {
      setTrimEndMs(nextDurationMs);
      trimEndMsRef.current = nextDurationMs;
    }
  };

  const selectedPause = pauses.find((pause) => pause.id === selectedPauseId);
  const selectedZoom = zooms.find((zoom) => zoom.id === selectedZoomId);

  const seekToExportMsRef = useRef<(ms: number) => void>(() => {});
  const stopPlaybackRef = useRef<() => void>(() => {});
  const dragZoomRef = useRef<{
    id: string;
    startAtMs: number;
    startDurationMs: number;
    clientX: number;
  } | null>(null);

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
    onSelectPause: (id) => {
      setSelectedPauseId(id);
      setSelectedZoomId(null);
    },
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
    () =>
      trimDrag.isDragging ||
      pauseDrag.isDragging ||
      dragZoomRef.current !== null,
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

  // Initialize once when the video loads for the first time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoaded = () => {
      if (video.duration) {
        const nextDuration = Math.round(video.duration * 1000);
        if (!hasMetadata || previewMode === "export") {
          setSourceDurationMs(nextDuration);
          setTrimEndMs(nextDuration);
          setTrimStartMs(0);
        }
      }
    };

    if (video.readyState >= 1) {
      handleLoaded();
    } else {
      video.addEventListener("loadedmetadata", handleLoaded);
    }
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
    };
  }, [activeVideoUrl, hasMetadata, previewMode]);

  // Track playback time updates
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (previewMode === "export") {
        setExportMs(Math.round(video.currentTime * 1000));
        return;
      }
      handleEditTimeUpdate();
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
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

  const addPauseAtPlayhead = useCallback(() => {
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
    setSelectedZoomId(null);
    seekToExportMs(sourceMsToExportMs(atMs, nextBlocks));
  }, [
    blocks,
    defaultHoldMs,
    seekToExportMs,
    trimEndMs,
    trimStartMs,
    stopPlayback,
  ]);

  const addZoomAtPlayhead = useCallback(() => {
    stopPlayback();
    const { sourceMs } = exportMsToPlayback(exportMsRef.current, blocks);
    const atMs = Math.min(trimEndMs, Math.max(trimStartMs, sourceMs));
    const id = `zoom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newZoom: EditorZoom = {
      id,
      atMs,
      durationMs: 2000,
      scale: 1.5,
      x: 0.5,
      y: 0.5,
    };
    setZooms((current) => [...current, newZoom]);
    setSelectedZoomId(id);
    setSelectedPauseId(null);
  }, [blocks, stopPlayback, trimEndMs, trimStartMs]);

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
      } else if (event.code === "KeyP") {
        event.preventDefault();
        addPauseAtPlayhead();
      } else if (event.code === "KeyZ") {
        event.preventDefault();
        addZoomAtPlayhead();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayback, addPauseAtPlayhead, addZoomAtPlayhead]);

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

  const removeZoom = (id: string) => {
    setZooms((current) => current.filter((zoom) => zoom.id !== id));
    if (selectedZoomId === id) setSelectedZoomId(null);
  };

  const updateZoom = (id: string, updates: Partial<Omit<EditorZoom, "id">>) => {
    setZooms((current) =>
      current.map((zoom) => (zoom.id === id ? { ...zoom, ...updates } : zoom)),
    );
  };

  const startZoomMoveDrag = (id: string, clientX: number) => {
    stopPlayback();
    const zoom = zooms.find((z) => z.id === id);
    if (!zoom) return;
    dragZoomRef.current = {
      id,
      startAtMs: zoom.atMs,
      startDurationMs: zoom.durationMs,
      clientX,
    };

    const onMouseMove = (e: MouseEvent) => {
      const anchor = dragZoomRef.current;
      if (!anchor) return;

      const container = timelineRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const deltaX =
        ((e.clientX - anchor.clientX) / rect.width) * sourceDurationMs;

      const newAtMs = Math.max(
        trimStartMs,
        Math.min(
          trimEndMs - anchor.startDurationMs,
          Math.round(anchor.startAtMs + deltaX),
        ),
      );

      setZooms((current) =>
        current.map((z) => (z.id === anchor.id ? { ...z, atMs: newAtMs } : z)),
      );
    };

    const onMouseUp = () => {
      dragZoomRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startZoomResizeDrag = (id: string, clientX: number) => {
    stopPlayback();
    const zoom = zooms.find((z) => z.id === id);
    if (!zoom) return;
    dragZoomRef.current = {
      id,
      startAtMs: zoom.atMs,
      startDurationMs: zoom.durationMs,
      clientX,
    };

    const onMouseMove = (e: MouseEvent) => {
      const anchor = dragZoomRef.current;
      if (!anchor) return;

      const container = timelineRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const deltaX =
        ((e.clientX - anchor.clientX) / rect.width) * sourceDurationMs;

      const newDurationMs = Math.max(
        400,
        Math.min(10000, Math.round(anchor.startDurationMs + deltaX)),
      );

      setZooms((current) =>
        current.map((z) =>
          z.id === anchor.id ? { ...z, durationMs: newDurationMs } : z,
        ),
      );
    };

    const onMouseUp = () => {
      dragZoomRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
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
          zooms: zooms.map(({ atMs, durationMs, scale, x, y }) => ({
            atMs,
            durationMs,
            scale,
            x,
            y,
          })),
          ...(hasMetadata ? {
            bezier: customBezier,
            durationMs: durationMs,
          } : {}),
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

  const currentZoomStyle = useMemo(() => {
    if (previewMode === "export") {
      return {};
    }
    const { sourceMs } = exportMsToPlayback(exportMs, blocks);
    const t = sourceMs;

    // Find if t falls within any zoom block
    const activeZoom = zooms.find(
      (z) => t >= z.atMs && t <= z.atMs + z.durationMs,
    );

    if (!activeZoom) {
      return {
        transform: "scale(1.0)",
        transformOrigin: "50% 50%",
      };
    }

    const trans = Math.min(500, activeZoom.durationMs / 2);
    let scale = 1.0;
    const originX = activeZoom.x;
    const originY = activeZoom.y;

    if (t < activeZoom.atMs + trans) {
      // Zooming in
      const ratio = (t - activeZoom.atMs) / trans;
      const eased = Math.max(0, Math.min(1, ratio));
      scale = 1.0 + (activeZoom.scale - 1.0) * eased;
    } else if (t > activeZoom.atMs + activeZoom.durationMs - trans) {
      // Zooming out
      const ratio = (activeZoom.atMs + activeZoom.durationMs - t) / trans;
      const eased = Math.max(0, Math.min(1, ratio));
      scale = 1.0 + (activeZoom.scale - 1.0) * eased;
    } else {
      // Zoom hold
      scale = activeZoom.scale;
    }

    return {
      transform: `scale(${scale})`,
      transformOrigin: `${originX * 100}% ${originY * 100}%`,
      transition: "transform 0.05s ease-out, transform-origin 0.05s ease-out",
    };
  }, [exportMs, blocks, zooms, previewMode]);

  return (
    <main className="app-shell app-shell-editor">
      <AppTopbar
        currentPath="/editor"
        onNavigate={onNavigate}
        hasEditorSession
        theme={theme}
        onToggleTheme={onToggleTheme}
        actions={
          <>
            {scrollStrategy && (
              <span className={`product-chip product-chip-${scrollStrategy}`}>
                {scrollStrategy === "virtual" ? "Virtual" : "Document"}
              </span>
            )}
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
              {scrollStrategy && (
                <span className={`editor-chip editor-chip-${scrollStrategy}`}>
                  {scrollStrategy === "virtual" ? "Virtual" : "Document"}
                </span>
              )}
            </div>
          </div>          {hasMetadata && (
            <section className="editor-sidebar-section" style={{ position: "relative" }}>
              <h3>Scroll Easing & Speed</h3>
              <div style={{ display: "flex", gap: "8px", position: "relative" }}>
                
                {/* 1. Curve Popover Trigger */}
                <div style={{ flex: 1, position: "static" }}>
                  <button
                    type="button"
                    className={`editor-tool-btn ${activePopover === "curve" ? "editor-tool-btn-active" : ""}`}
                    style={{ width: "100%", justifyContent: "center", display: "flex", flexDirection: "column", height: "64px", gap: "2px", textAlign: "center" }}
                    onClick={() => setActivePopover(activePopover === "curve" ? null : "curve")}
                  >
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.05em" }}>Curve</span>
                    <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-primary)" }}>
                      {curvePreset === "custom" ? "Custom" : CURVES.find((c) => c.id === curvePreset)?.label || "Custom"}
                    </span>
                  </button>

                  {activePopover === "curve" && (
                    <div style={{
                      position: "absolute",
                      top: "76px",
                      left: "0",
                      right: "0",
                      background: "var(--bg-bento, #18181b)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "16px",
                      zIndex: 100,
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: "600", fontSize: "0.9rem", color: "var(--text-primary)" }}>Select Scroll Curve</span>
                        <button
                          type="button"
                          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem", padding: "4px" }}
                          onClick={() => setActivePopover(null)}
                        >
                          ✕
                        </button>
                      </div>

                      <select
                        value={curvePreset}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCurvePreset(val);
                          if (val === "linear") setCustomBezier([0.0, 0.0, 1.0, 1.0]);
                          else if (val === "ease-in") setCustomBezier([0.42, 0.0, 1.0, 1.0]);
                          else if (val === "ease-out") setCustomBezier([0.0, 0.0, 0.58, 1.0]);
                          else if (val === "ease-in-out") setCustomBezier([0.42, 0.0, 0.58, 1.0]);
                          else if (val === "ease-in-cubic") setCustomBezier([0.55, 0.055, 0.675, 0.19]);
                          else if (val === "ease-out-cubic") setCustomBezier([0.215, 0.61, 0.355, 1.0]);
                          else if (val === "ease-in-out-cubic") setCustomBezier([0.645, 0.045, 0.355, 1.0]);
                        }}
                        className="product-select"
                        style={{ width: "100%", padding: "6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text-primary)" }}
                      >
                        <option value="ease-in-out">Ease In Out</option>
                        <option value="ease-in">Ease In</option>
                        <option value="ease-out">Ease Out</option>
                        <option value="linear">Linear</option>
                        <option value="ease-in-cubic">Ease In Cubic</option>
                        <option value="ease-out-cubic">Ease Out Cubic</option>
                        <option value="ease-in-out-cubic">Ease In Out Cubic</option>
                        <option value="custom">Custom Bezier</option>
                      </select>

                      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "6px", padding: "8px" }}>
                        <BezierVisualizer
                          selectedCurve={curvePreset}
                          setSelectedCurve={setCurvePreset}
                          customBezier={customBezier}
                          setCustomBezier={setCustomBezier}
                          customInputText={customBezier.map(n => n.toFixed(2)).join(", ")}
                          setCustomInputText={() => {}}
                          embedded={true}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Speed Popover Trigger */}
                <div style={{ flex: 1, position: "static" }}>
                  <button
                    type="button"
                    className={`editor-tool-btn ${activePopover === "speed" ? "editor-tool-btn-active" : ""}`}
                    style={{ width: "100%", justifyContent: "center", display: "flex", flexDirection: "column", height: "64px", gap: "2px", textAlign: "center" }}
                    onClick={() => setActivePopover(activePopover === "speed" ? null : "speed")}
                  >
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.05em" }}>Duration</span>
                    <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-primary)" }}>
                      {Math.round((durationMs / 1000) * 10) / 10}s
                    </span>
                  </button>

                  {activePopover === "speed" && (
                    <div style={{
                      position: "absolute",
                      top: "76px",
                      left: "0",
                      right: "0",
                      background: "var(--bg-bento, #18181b)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "16px",
                      zIndex: 100,
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: "600", fontSize: "0.9rem", color: "var(--text-primary)" }}>Duration & Speed</span>
                        <button
                          type="button"
                          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem", padding: "4px" }}
                          onClick={() => setActivePopover(null)}
                        >
                          ✕
                        </button>
                      </div>

                      {/* Speed Presets */}
                      <div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", display: "block", marginBottom: "6px" }}>Speed Presets</span>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "4px" }}>
                          {[0.25, 0.5, 1.0, 1.5, 2.0].map((preset) => {
                            const initialDur = metaInitialDurationMs || 5433;
                            const presetDurationSec = Math.max(2, (initialDur / preset) / 1000);
                            return (
                              <button
                                key={preset}
                                type="button"
                                className="product-btn"
                                style={{
                                  padding: "6px 0",
                                  fontSize: "0.75rem",
                                  border: "1px solid var(--border)",
                                  borderRadius: "4px",
                                  background: "rgba(255, 255, 255, 0.02)",
                                  cursor: "pointer",
                                  color: "var(--text-primary)",
                                  textAlign: "center"
                                }}
                                onClick={() => {
                                  handleDurationChange(presetDurationSec);
                                }}
                              >
                                {preset}x
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Slider Control */}
                      <label className="editor-inspector-field" style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          <span>Timeline Duration</span>
                          <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                            {Math.round((durationMs / 1000) * 10) / 10}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={40}
                          step={0.5}
                          value={Math.round((durationMs / 1000) * 2) / 2}
                          onChange={(e) => handleDurationChange(Math.max(2, Number(e.target.value)))}
                          style={{ width: "100%", accentColor: "var(--text-primary)", height: "4px", background: "var(--border)", borderRadius: "2px", outline: "none", cursor: "pointer" }}
                        />
                      </label>
                    </div>
                  )}
                </div>

              </div>
            </section>
          )}

          <section className="editor-sidebar-section">
            <h3>Tools</h3>
            <button
              type="button"
              className={`editor-tool-btn ${!selectedPauseId && !selectedZoomId ? "editor-tool-btn-active" : ""}`}
              onClick={() => {
                setSelectedPauseId(null);
                setSelectedZoomId(null);
              }}
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
            <button
              type="button"
              className="editor-tool-btn"
              onClick={addZoomAtPlayhead}
              disabled={sourceDurationMs <= 0 || previewMode === "export"}
            >
              <LordIcon src={LORDICON.motion} size={18} trigger="hover" />
              Add zoom
              <kbd className="editor-tool-kbd">Z</kbd>
            </button>
          </section>

          <section className="editor-sidebar-section">
            <h3>Inspector</h3>
            {selectedPause ? (
              <div className="editor-inspector-card">
                <div className="editor-inspector-row">
                  <span>Pause Position</span>
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
            ) : selectedZoom ? (
              <div className="editor-inspector-card">
                <div className="editor-inspector-row">
                  <span>Zoom Position</span>
                  <strong>{formatTime(selectedZoom.atMs)}</strong>
                </div>

                <label className="editor-inspector-field">
                  Zoom Scale ({selectedZoom.scale.toFixed(1)}x)
                  <input
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.1"
                    value={selectedZoom.scale}
                    onChange={(event) =>
                      updateZoom(selectedZoom.id, {
                        scale: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <label className="editor-inspector-field">
                  Zoom Duration (ms)
                  <input
                    type="number"
                    min={400}
                    max={10000}
                    step={100}
                    value={selectedZoom.durationMs}
                    onChange={(event) =>
                      updateZoom(selectedZoom.id, {
                        durationMs: Math.max(
                          400,
                          Number(event.target.value) || 2000,
                        ),
                      })
                    }
                  />
                </label>

                <div className="editor-inspector-coords-display">
                  <span>Center Anchor</span>
                  <div>
                    X: {Math.round(selectedZoom.x * 100)}% · Y:{" "}
                    {Math.round(selectedZoom.y * 100)}%
                  </div>
                </div>

                <button
                  type="button"
                  className="editor-inspector-delete"
                  onClick={() => removeZoom(selectedZoom.id)}
                >
                  Delete zoom
                </button>
              </div>
            ) : (
              <div className="editor-inspector-card editor-inspector-empty">
                <p>
                  Select a pause or zoom block on the timeline, or add one at
                  the playhead.
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
              style={{ ...currentZoomStyle }}
            />
            {selectedZoom && previewMode === "edit" && (
              <ZoomBoxOverlay
                zoom={selectedZoom}
                onChange={(updates) => updateZoom(selectedZoom.id, updates)}
              />
            )}
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
            {zooms.length > 0 &&
              ` · ${zooms.length} zoom${zooms.length === 1 ? "" : "s"}`}
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
              setSelectedZoomId(null);
              const pause = effectivePauses.find(
                (entry) => entry.id === pauseId,
              );
              if (pause) {
                seekToExportMs(sourceMsToExportMs(pause.atMs, blocks));
              }
            }}
            zooms={zooms}
            selectedZoomId={selectedZoomId}
            onSelectZoom={(zoomId) => {
              setSelectedZoomId(zoomId);
              setSelectedPauseId(null);
              const zoom = zooms.find((entry) => entry.id === zoomId);
              if (zoom) {
                seekToExportMs(sourceMsToExportMs(zoom.atMs, blocks));
              }
            }}
            onZoomDrag={startZoomMoveDrag}
            onZoomResize={startZoomResizeDrag}
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
