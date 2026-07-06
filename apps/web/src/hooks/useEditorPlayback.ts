import { useCallback, useEffect, useRef } from "react";
import {
  blockAfter,
  exportMsToPlayback,
  findBlockAtExportMs,
  findPlayBlockAtSourceMs,
  sourceMsToExportMs,
  type TimelineBlock,
} from "../lib/editorTimeline";

type PlaybackPhase = "idle" | "playing" | "holding";

interface UseEditorPlaybackOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  blocksRef: React.MutableRefObject<TimelineBlock[]>;
  exportDurationMsRef: React.MutableRefObject<number>;
  exportMsRef: React.MutableRefObject<number>;
  setExportMs: (ms: number) => void;
  previewMode: "edit" | "export";
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

const END_TOLERANCE_MS = 40;

export function useEditorPlayback({
  videoRef,
  blocksRef,
  exportDurationMsRef,
  exportMsRef,
  setExportMs,
  previewMode,
  isPlaying,
  setIsPlaying,
}: UseEditorPlaybackOptions) {
  const phaseRef = useRef<PlaybackPhase>("idle");
  const holdRafRef = useRef(0);
  const previewModeRef = useRef(previewMode);
  const isPlayingRef = useRef(isPlaying);

  previewModeRef.current = previewMode;
  isPlayingRef.current = isPlaying;

  const stopPlayback = useCallback(() => {
    phaseRef.current = "idle";
    if (holdRafRef.current) {
      cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = 0;
    }
    videoRef.current?.pause();
    setIsPlaying(false);
  }, [setIsPlaying, videoRef]);

  const seekToExportMs = useCallback(
    (exportMs: number, pauseVideo = true) => {
      const video = videoRef.current;
      const duration = exportDurationMsRef.current;
      if (!video || previewModeRef.current !== "edit" || duration <= 0) {
        return;
      }

      const clamped = Math.min(duration, Math.max(0, exportMs));
      const { sourceMs } = exportMsToPlayback(clamped, blocksRef.current);
      if (pauseVideo) {
        video.pause();
        phaseRef.current = "idle";
      }
      video.currentTime = sourceMs / 1000;
      exportMsRef.current = clamped;
      setExportMs(clamped);
    },
    [exportDurationMsRef, exportMsRef, setExportMs, videoRef],
  );

  const beginPlaybackAtRef = useRef<(exportMs: number) => void>(() => {});

  const runHold = useCallback(
    (fromExportMs: number) => {
      const video = videoRef.current;
      const block = findBlockAtExportMs(fromExportMs, blocksRef.current);
      if (!video || !block || block.type !== "freeze") {
        stopPlayback();
        return;
      }

      phaseRef.current = "holding";
      video.pause();
      video.currentTime = block.sourceStartMs / 1000;

      const holdDurationMs = block.exportEndMs - fromExportMs;
      const startedAt = performance.now();

      const tick = (now: number) => {
        if (phaseRef.current !== "holding" || !isPlayingRef.current) {
          return;
        }

        const elapsed = now - startedAt;
        const nextExport = Math.min(block.exportEndMs, fromExportMs + elapsed);
        exportMsRef.current = nextExport;
        setExportMs(nextExport);

        if (elapsed >= holdDurationMs) {
          holdRafRef.current = 0;
          const resumeAt = block.exportEndMs;
          if (resumeAt >= exportDurationMsRef.current) {
            stopPlayback();
            return;
          }
          beginPlaybackAtRef.current(resumeAt);
          return;
        }

        holdRafRef.current = requestAnimationFrame(tick);
      };

      holdRafRef.current = requestAnimationFrame(tick);
    },
    [exportDurationMsRef, exportMsRef, setExportMs, stopPlayback, videoRef],
  );

  const beginPlaybackAt = useCallback(
    (exportMs: number) => {
      const video = videoRef.current;
      if (!video || previewModeRef.current !== "edit") return;

      const { sourceMs, isFrozen } = exportMsToPlayback(
        exportMs,
        blocksRef.current,
      );

      exportMsRef.current = exportMs;
      setExportMs(exportMs);

      if (isFrozen) {
        runHold(exportMs);
        return;
      }

      phaseRef.current = "playing";
      video.currentTime = sourceMs / 1000;
      void video.play().catch(() => {
        stopPlayback();
      });
    },
    [exportMsRef, runHold, setExportMs, stopPlayback, videoRef],
  );

  beginPlaybackAtRef.current = beginPlaybackAt;

  const handleTimeUpdate = useCallback(() => {
    if (previewModeRef.current !== "edit") return;
    if (phaseRef.current !== "playing" || !isPlayingRef.current) return;

    const video = videoRef.current;
    if (!video) return;

    const sourceMs = Math.round(video.currentTime * 1000);
    const playBlock = findPlayBlockAtSourceMs(sourceMs, blocksRef.current);

    if (!playBlock) {
      return;
    }

    const nextExportMs = sourceMsToExportMs(sourceMs, blocksRef.current);
    exportMsRef.current = nextExportMs;
    setExportMs(nextExportMs);

    if (sourceMs < playBlock.sourceEndMs - END_TOLERANCE_MS) {
      return;
    }

    video.pause();
    video.currentTime = playBlock.sourceEndMs / 1000;
    exportMsRef.current = playBlock.exportEndMs;
    setExportMs(playBlock.exportEndMs);

    const nextBlock = blockAfter(playBlock, blocksRef.current);
    if (nextBlock?.type === "freeze") {
      runHold(playBlock.exportEndMs);
      return;
    }

    if (playBlock.exportEndMs >= exportDurationMsRef.current) {
      stopPlayback();
      return;
    }

    beginPlaybackAt(playBlock.exportEndMs);
  }, [
    beginPlaybackAt,
    exportDurationMsRef,
    exportMsRef,
    runHold,
    setExportMs,
    stopPlayback,
    videoRef,
  ]);

  const startPlayback = useCallback(() => {
    if (exportMsRef.current >= exportDurationMsRef.current) {
      exportMsRef.current = 0;
      setExportMs(0);
    }
    setIsPlaying(true);
    beginPlaybackAt(exportMsRef.current);
  }, [
    beginPlaybackAt,
    exportDurationMsRef,
    exportMsRef,
    setExportMs,
    setIsPlaying,
  ]);

  const pausePlayback = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  useEffect(() => {
    if (!isPlaying && phaseRef.current !== "idle") {
      phaseRef.current = "idle";
      if (holdRafRef.current) {
        cancelAnimationFrame(holdRafRef.current);
        holdRafRef.current = 0;
      }
      videoRef.current?.pause();
    }
  }, [isPlaying, videoRef]);

  useEffect(() => {
    return () => {
      if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    };
  }, []);

  return {
    seekToExportMs,
    startPlayback,
    pausePlayback,
    handleTimeUpdate,
    stopPlayback,
  };
}
