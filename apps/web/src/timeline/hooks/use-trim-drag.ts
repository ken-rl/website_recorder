import { useCallback, useEffect, useRef, useState } from "react";
import {
  exportMsToSourceMs,
  type EditorPauseInput,
  type TimelineBlock,
} from "../../lib/editorTimeline";
import {
  commitTrimPreview,
  computeTrimPreview,
  previewSeekExportMs,
  type TrimHandle,
  type TrimPreview,
} from "../controllers/trim-controller";
import { sourceMsFromClientX } from "../utils";

interface UseTrimDragOptions {
  timelineRef: React.RefObject<HTMLDivElement | null>;
  trimStartMs: number;
  trimEndMs: number;
  sourceDurationMsRef: React.MutableRefObject<number>;
  trimStartMsRef: React.MutableRefObject<number>;
  trimEndMsRef: React.MutableRefObject<number>;
  pausesRef: React.MutableRefObject<EditorPauseInput[]>;
  blocksRef: React.MutableRefObject<TimelineBlock[]>;
  exportMsRef: React.MutableRefObject<number>;
  setTrimStartMs: (ms: number) => void;
  setTrimEndMs: (ms: number) => void;
  seekToExportMs: (ms: number) => void;
  stopPlayback: () => void;
}

export function useTrimDrag({
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
  seekToExportMs,
  stopPlayback,
}: UseTrimDragOptions) {
  const [dragHandle, setDragHandle] = useState<TrimHandle | null>(null);
  const [preview, setPreview] = useState<TrimPreview | null>(null);
  const previewRef = useRef<TrimPreview | null>(null);

  const resolveSourceMs = useCallback(
    (clientX: number) =>
      sourceMsFromClientX(
        clientX,
        timelineRef.current,
        sourceDurationMsRef.current,
      ),
    [sourceDurationMsRef, timelineRef],
  );

  const startDrag = useCallback(
    (handle: TrimHandle) => {
      stopPlayback();
      setDragHandle(handle);
      setPreview(null);
      previewRef.current = null;
    },
    [stopPlayback],
  );

  useEffect(() => {
    if (!dragHandle) return;

    const handleMove = (event: MouseEvent) => {
      const ctx = {
        committed: {
          trimStartMs: trimStartMsRef.current,
          trimEndMs: trimEndMsRef.current,
          sourceDurationMs: sourceDurationMsRef.current,
        },
        pauses: pausesRef.current,
        playheadSourceMs: exportMsToSourceMs(
          exportMsRef.current,
          blocksRef.current,
        ),
      };

      const nextPreview = computeTrimPreview(
        dragHandle,
        resolveSourceMs(event.clientX),
        ctx,
      );

      previewRef.current = nextPreview;
      setPreview(nextPreview);
      seekToExportMs(previewSeekExportMs(nextPreview, pausesRef.current));
    };

    const handleUp = () => {
      const finalPreview = previewRef.current;
      if (finalPreview) {
        const committed = commitTrimPreview(finalPreview);
        setTrimStartMs(committed.trimStartMs);
        setTrimEndMs(committed.trimEndMs);
      }

      setDragHandle(null);
      setPreview(null);
      previewRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    blocksRef,
    dragHandle,
    exportMsRef,
    pausesRef,
    resolveSourceMs,
    seekToExportMs,
    setTrimEndMs,
    setTrimStartMs,
    sourceDurationMsRef,
    trimEndMsRef,
    trimStartMsRef,
  ]);

  const displayTrimStartMs = preview?.trimStartMs ?? trimStartMs;
  const displayTrimEndMs = preview?.trimEndMs ?? trimEndMs;

  return {
    dragHandle,
    isDragging: dragHandle !== null,
    displayTrimStartMs,
    displayTrimEndMs,
    startTrimStartDrag: () => startDrag("start"),
    startTrimEndDrag: () => startDrag("end"),
  };
}
