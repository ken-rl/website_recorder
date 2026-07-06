import { useCallback, useEffect, useRef } from "react";
import {
  exportMsToPlayback,
  exportMsToSourcePlayheadPercent,
  type TimelineBlock,
} from "../../lib/editorTimeline";

interface UsePlaybackClockOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  blocksRef: React.MutableRefObject<TimelineBlock[]>;
  exportDurationMsRef: React.MutableRefObject<number>;
  exportMsRef: React.MutableRefObject<number>;
  sourceDurationMsRef: React.MutableRefObject<number>;
  setExportMs: (ms: number) => void;
  previewMode: "edit" | "export";
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  onPlayheadUpdate?: (percent: number) => void;
}

export function usePlaybackClock({
  videoRef,
  blocksRef,
  exportDurationMsRef,
  exportMsRef,
  sourceDurationMsRef,
  setExportMs,
  previewMode,
  isPlaying,
  setIsPlaying,
  onPlayheadUpdate,
}: UsePlaybackClockOptions) {
  const rafRef = useRef(0);
  const playAnchorRef = useRef<{ exportMs: number; timestamp: number } | null>(
    null,
  );
  const previewModeRef = useRef(previewMode);
  const isPlayingRef = useRef(isPlaying);
  const onPlayheadUpdateRef = useRef(onPlayheadUpdate);

  previewModeRef.current = previewMode;
  onPlayheadUpdateRef.current = onPlayheadUpdate;

  const cancelRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const updatePlayhead = useCallback(
    (exportMs: number) => {
      const duration = sourceDurationMsRef.current;
      if (duration <= 0) return;
      const percent = exportMsToSourcePlayheadPercent(
        exportMs,
        duration,
        blocksRef.current,
      );
      onPlayheadUpdateRef.current?.(percent);
    },
    [blocksRef, sourceDurationMsRef],
  );

  const applyExportPosition = useCallback(
    (
      exportMs: number,
      options?: { skipPlayhead?: boolean; isPlayback?: boolean },
    ) => {
      const video = videoRef.current;
      const duration = exportDurationMsRef.current;
      if (!video || previewModeRef.current !== "edit" || duration <= 0) {
        return;
      }

      const clamped = Math.min(duration, Math.max(0, exportMs));
      const { sourceMs, isFrozen } = exportMsToPlayback(
        clamped,
        blocksRef.current,
      );
      const targetSeconds = sourceMs / 1000;
      const isPlayback = options?.isPlayback ?? false;

      if (isFrozen) {
        video.pause();
        if (Math.abs(video.currentTime - targetSeconds) > 0.0005) {
          video.currentTime = targetSeconds;
        }
      } else if (isPlayback) {
        if (Math.abs(video.currentTime - targetSeconds) > 0.12) {
          video.currentTime = targetSeconds;
        }
        if (video.paused) {
          void video.play().catch(() => {});
        }
      } else {
        video.pause();
        if (Math.abs(video.currentTime - targetSeconds) > 0.0005) {
          video.currentTime = targetSeconds;
        }
      }

      exportMsRef.current = clamped;
      setExportMs(clamped);

      if (!options?.skipPlayhead) {
        updatePlayhead(clamped);
      }
    },
    [exportDurationMsRef, exportMsRef, setExportMs, updatePlayhead, videoRef],
  );

  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    cancelRaf();
    playAnchorRef.current = null;
    videoRef.current?.pause();
    setIsPlaying(false);
  }, [cancelRaf, setIsPlaying, videoRef]);

  const tickRef = useRef<(now: number) => void>(() => {});

  const tick = useCallback(
    (now: number) => {
      if (!isPlayingRef.current || previewModeRef.current !== "edit") {
        return;
      }

      const anchor = playAnchorRef.current;
      if (!anchor) return;

      const duration = exportDurationMsRef.current;
      const elapsed = now - anchor.timestamp;
      const nextExport = Math.min(duration, anchor.exportMs + elapsed);

      applyExportPosition(nextExport, { isPlayback: true });

      if (nextExport >= duration) {
        stopPlayback();
        return;
      }

      rafRef.current = requestAnimationFrame(tickRef.current);
    },
    [applyExportPosition, exportDurationMsRef, stopPlayback],
  );

  tickRef.current = tick;

  const seekToExportMs = useCallback(
    (exportMs: number) => {
      isPlayingRef.current = false;
      cancelRaf();
      playAnchorRef.current = null;
      setIsPlaying(false);
      applyExportPosition(exportMs);
    },
    [applyExportPosition, cancelRaf, setIsPlaying],
  );

  const startPlayback = useCallback(() => {
    const duration = exportDurationMsRef.current;
    if (duration <= 0) return;

    let startAt = exportMsRef.current;
    if (startAt >= duration) {
      startAt = 0;
      applyExportPosition(0);
    }

    isPlayingRef.current = true;
    setIsPlaying(true);
    playAnchorRef.current = { exportMs: startAt, timestamp: performance.now() };
    cancelRaf();
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [
    applyExportPosition,
    cancelRaf,
    exportDurationMsRef,
    exportMsRef,
    setIsPlaying,
  ]);

  const pausePlayback = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const handleTimeUpdate = useCallback(() => {
    // Edit preview is fully driven by the export clock.
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!isPlaying) {
      cancelRaf();
      playAnchorRef.current = null;
      videoRef.current?.pause();
    }
  }, [cancelRaf, isPlaying, videoRef]);

  useEffect(() => {
    return () => {
      cancelRaf();
    };
  }, [cancelRaf]);

  return {
    seekToExportMs,
    startPlayback,
    pausePlayback,
    handleTimeUpdate,
    stopPlayback,
    updatePlayhead,
  };
}
