import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorPauseInput, TimelineBlock } from "../../lib/editorTimeline";
import {
  computePausePreview,
  createPauseMoveDrag,
  createPauseResizeDrag,
  pauseMoveSeekExportMs,
  type PauseDragState,
} from "../controllers/pause-controller";
import { sourceMsFromClientX } from "../utils";

interface UsePauseDragOptions {
  timelineRef: React.RefObject<HTMLDivElement | null>;
  sourceDurationMsRef: React.MutableRefObject<number>;
  trimStartMsRef: React.MutableRefObject<number>;
  trimEndMsRef: React.MutableRefObject<number>;
  pausesRef: React.MutableRefObject<EditorPauseInput[]>;
  blocksRef: React.MutableRefObject<TimelineBlock[]>;
  setPauses: React.Dispatch<React.SetStateAction<EditorPauseInput[]>>;
  seekToExportMs: (ms: number) => void;
  stopPlayback: () => void;
  onSelectPause: (pauseId: string) => void;
}

export function usePauseDrag({
  timelineRef,
  sourceDurationMsRef,
  trimStartMsRef,
  trimEndMsRef,
  pausesRef,
  blocksRef,
  setPauses,
  seekToExportMs,
  stopPlayback,
  onSelectPause,
}: UsePauseDragOptions) {
  const [drag, setDrag] = useState<PauseDragState | null>(null);
  const [previewPauses, setPreviewPauses] = useState<EditorPauseInput[] | null>(
    null,
  );
  const previewPausesRef = useRef<EditorPauseInput[] | null>(null);

  const resolveSourceMs = useCallback(
    (clientX: number) =>
      sourceMsFromClientX(
        clientX,
        timelineRef.current,
        sourceDurationMsRef.current,
      ),
    [sourceDurationMsRef, timelineRef],
  );

  const startMoveDrag = useCallback(
    (pauseId: string, clientX: number) => {
      const pause = pausesRef.current.find((entry) => entry.id === pauseId);
      if (!pause) return;

      stopPlayback();
      onSelectPause(pauseId);
      const nextDrag = createPauseMoveDrag(
        pauseId,
        pause.atMs,
        clientX,
        resolveSourceMs,
      );
      setDrag(nextDrag);
      setPreviewPauses(null);
      previewPausesRef.current = null;
    },
    [onSelectPause, pausesRef, resolveSourceMs, stopPlayback],
  );

  const startResizeDrag = useCallback(
    (pauseId: string) => {
      stopPlayback();
      onSelectPause(pauseId);
      setDrag(createPauseResizeDrag(pauseId));
      setPreviewPauses(null);
      previewPausesRef.current = null;
    },
    [onSelectPause, stopPlayback],
  );

  useEffect(() => {
    if (!drag) return;

    const handleMove = (event: MouseEvent) => {
      const nextPauses = computePausePreview(
        drag,
        event.clientX,
        resolveSourceMs,
        trimStartMsRef.current,
        trimEndMsRef.current,
        pausesRef.current,
      );

      previewPausesRef.current = nextPauses;
      setPreviewPauses(nextPauses);

      if (drag.mode === "move") {
        seekToExportMs(
          pauseMoveSeekExportMs(
            nextPauses,
            drag.pauseId,
            trimStartMsRef.current,
            trimEndMsRef.current,
          ),
        );
        return;
      }

      const pause = nextPauses.find((entry) => entry.id === drag.pauseId);
      if (pause) {
        seekToExportMs(
          pauseMoveSeekExportMs(
            nextPauses,
            drag.pauseId,
            trimStartMsRef.current,
            trimEndMsRef.current,
          ) + Math.max(0, pause.holdMs - 1),
        );
      }
    };

    const handleUp = () => {
      const finalPauses = previewPausesRef.current;
      if (finalPauses) {
        pausesRef.current = finalPauses;
        setPauses(finalPauses);
      }

      setDrag(null);
      setPreviewPauses(null);
      previewPausesRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    blocksRef,
    drag,
    pausesRef,
    resolveSourceMs,
    seekToExportMs,
    setPauses,
    trimEndMsRef,
    trimStartMsRef,
  ]);

  return {
    dragPauseId: drag?.pauseId ?? null,
    dragMode: drag?.mode ?? null,
    isDragging: drag !== null,
    previewPauses,
    startMoveDrag,
    startResizeDrag,
  };
}
