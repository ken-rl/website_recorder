import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampSourceMs,
  sourceMsToExportMs,
  type TimelineBlock,
} from "../../lib/editorTimeline";
import {
  createSeekSession,
  shouldSeekOnRelease,
  updateSeekSession,
  type SeekSession,
} from "../controllers/seek-controller";
import { sourceMsFromClientX } from "../utils";

interface UseTimelineSeekOptions {
  timelineRef: React.RefObject<HTMLDivElement | null>;
  sourceDurationMsRef: React.MutableRefObject<number>;
  trimStartMsRef: React.MutableRefObject<number>;
  trimEndMsRef: React.MutableRefObject<number>;
  blocksRef: React.MutableRefObject<TimelineBlock[]>;
  seekToExportMs: (ms: number) => void;
  stopPlayback: () => void;
  isInteractionBlocked: () => boolean;
}

export function useTimelineSeek({
  timelineRef,
  sourceDurationMsRef,
  trimStartMsRef,
  trimEndMsRef,
  blocksRef,
  seekToExportMs,
  stopPlayback,
  isInteractionBlocked,
}: UseTimelineSeekOptions) {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const sessionRef = useRef<SeekSession | null>(null);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const sourceMs = sourceMsFromClientX(
        clientX,
        timelineRef.current,
        sourceDurationMsRef.current,
      );
      const clamped = clampSourceMs(
        sourceMs,
        trimStartMsRef.current,
        trimEndMsRef.current,
      );
      seekToExportMs(sourceMsToExportMs(clamped, blocksRef.current));
    },
    [
      blocksRef,
      seekToExportMs,
      sourceDurationMsRef,
      timelineRef,
      trimEndMsRef,
      trimStartMsRef,
    ],
  );

  const endSession = useCallback(() => {
    sessionRef.current = null;
    setIsScrubbing(false);
  }, []);

  const startTrackSeek = useCallback(
    (clientX: number, clientY: number) => {
      if (isInteractionBlocked()) return;
      stopPlayback();
      sessionRef.current = createSeekSession(clientX, clientY);
      setSessionEpoch((value) => value + 1);
    },
    [isInteractionBlocked, stopPlayback],
  );

  const startPlayheadScrub = useCallback(
    (clientX: number, clientY: number) => {
      if (isInteractionBlocked()) return;
      stopPlayback();
      sessionRef.current = createSeekSession(clientX, clientY, true);
      setIsScrubbing(true);
      setSessionEpoch((value) => value + 1);
    },
    [isInteractionBlocked, stopPlayback],
  );

  useEffect(() => {
    if (sessionEpoch === 0) return;

    const handleMove = (event: MouseEvent) => {
      const current = sessionRef.current;
      if (!current) return;

      const next = updateSeekSession(current, event.clientX, event.clientY);
      sessionRef.current = next;

      if (next.isScrubbing) {
        setIsScrubbing(true);
        seekFromClientX(event.clientX);
      }
    };

    const handleUp = (event: MouseEvent) => {
      const current = sessionRef.current;
      if (!current) return;

      if (shouldSeekOnRelease(current)) {
        seekFromClientX(event.clientX);
      }

      endSession();
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [endSession, seekFromClientX, sessionEpoch]);

  return {
    isScrubbing,
    startTrackSeek,
    startPlayheadScrub,
  };
}
