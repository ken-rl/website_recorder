import { CLICK_DRAG_THRESHOLD_PX, pointerDelta } from "../utils";

export interface SeekSession {
  startClientX: number;
  startClientY: number;
  moved: boolean;
  isScrubbing: boolean;
}

export function createSeekSession(
  clientX: number,
  clientY: number,
  forceScrub = false,
): SeekSession {
  return {
    startClientX: clientX,
    startClientY: clientY,
    moved: false,
    isScrubbing: forceScrub,
  };
}

export function updateSeekSession(
  session: SeekSession,
  clientX: number,
  clientY: number,
): SeekSession {
  if (session.isScrubbing) {
    return { ...session, moved: true };
  }

  const delta = pointerDelta(
    session.startClientX,
    session.startClientY,
    clientX,
    clientY,
  );

  if (delta > CLICK_DRAG_THRESHOLD_PX) {
    return { ...session, moved: true, isScrubbing: true };
  }

  return session;
}

export function shouldSeekOnRelease(session: SeekSession): boolean {
  return !session.moved && !session.isScrubbing;
}
