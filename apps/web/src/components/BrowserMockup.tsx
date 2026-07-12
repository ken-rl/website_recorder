import React, { useRef, useState, useEffect } from "react";

interface BrowserMockupProps {
  url: string;
  videoUrl: string | null;
  /** Final, baked video only. Omit while the preview is showing an unstaged source. */
  downloadUrl?: string | null;
  duration: string | null;
  scrollStrategy?: "document" | "virtual";
  width: number;
  height: number;
  isSubmitting: boolean;
  isRenderingStyle?: boolean;
  /** Elapsed capture time (e.g. "12.4s"). */
  recordingElapsed?: string;
}

export default function BrowserMockup({
  url,
  videoUrl,
  downloadUrl,
  duration,
  scrollStrategy,
  width,
  height,
  isSubmitting,
  isRenderingStyle = false,
  recordingElapsed,
}: BrowserMockupProps) {
  const isPortrait = width < height;
  const displayUrl = url || "https://example.com";
  const shortUrl = displayUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const previewState = videoUrl ? "ready" : isSubmitting ? "recording" : "idle";
  const previewVars = {
    "--preview-w": String(width),
    "--preview-h": String(height),
  } as React.CSSProperties;

  // Custom Video Player States
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Auto-hide controls during playback
  useEffect(() => {
    let timeoutId: any;
    const resetTimer = () => {
      setShowControls(true);
      clearTimeout(timeoutId);
      if (isPlaying) {
        timeoutId = setTimeout(() => {
          setShowControls(false);
        }, 2200);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", resetTimer);
      container.addEventListener("click", resetTimer);
    }
    resetTimer();

    return () => {
      if (container) {
        container.removeEventListener("mousemove", resetTimer);
        container.removeEventListener("click", resetTimer);
      }
      clearTimeout(timeoutId);
    };
  }, [isPlaying]);

  const handlePlayPause = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch((err) => console.log("Play failed:", err));
    }
  };

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    videoRef.current.muted = nextMute;
    setIsMuted(nextMute);
  };

  const handleFullscreenToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error("Fullscreen failed:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const seekFromPointer = (clientX: number, element: HTMLDivElement) => {
    if (!videoRef.current || videoDuration === 0) return;
    const rect = element.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    videoRef.current.currentTime = percentage * videoDuration;
    setCurrentTime(percentage * videoDuration);
  };

  const handleScrubStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsScrubbing(true);
    seekFromPointer(e.clientX, e.currentTarget);
  };

  const handleScrubMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.stopPropagation();
    seekFromPointer(e.clientX, e.currentTarget);
  };

  const handleScrubEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsScrubbing(false);
  };

  const formatTime = (timeInSecs: number) => {
    if (Number.isNaN(timeInSecs)) return "0:00";
    const mins = Math.floor(timeInSecs / 60);
    const secs = Math.floor(timeInSecs % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const progressPercent = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  if (videoUrl) {
    return (
      <div
        className={`result-container capture-window${isPortrait ? " is-portrait-device" : " is-landscape-device"}`}
        style={previewVars}
      >
        <div
          ref={containerRef}
          onClick={() => handlePlayPause()}
          className="custom-video-player-container"
        >
          <video
            ref={videoRef}
            id="player"
            src={videoUrl}
            autoPlay
            playsInline
            onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
            onLoadedMetadata={() => videoRef.current && setVideoDuration(videoRef.current.duration)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              background: "#000000",
            }}
          />

          {isRenderingStyle && (
            <div className="style-render-veil" role="status" aria-live="polite" onClick={(e) => e.stopPropagation()}>
              <span className="style-render-spinner" aria-hidden="true" />
              <span>Rendering style</span>
              <small>Export unlocks when it’s ready</small>
            </div>
          )}

          {/* Premium Custom Player Control Deck */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: "12px",
              left: "12px",
              right: "12px",
              background: "rgba(10, 10, 12, 0.75)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "8px",
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              zIndex: 10,
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              opacity: showControls ? 1 : 0,
              transform: showControls ? "translateY(0)" : "translateY(8px)",
              pointerEvents: showControls ? "auto" : "none",
            }}
            className="player-controls-deck"
          >
            {/* Play/Pause Trigger */}
            <button
              type="button"
              onClick={handlePlayPause}
              style={{
                background: "transparent",
                border: "none",
                color: "#ffffff",
                cursor: "pointer",
                padding: "2px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.2s ease",
              }}
              className="player-control-btn"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: "20px", height: "20px" }}>
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: "20px", height: "20px" }}>
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Current/Duration Readout */}
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "11px",
                color: "var(--text-secondary, #999)",
                minWidth: "75px",
                userSelect: "none",
              }}
            >
              {formatTime(currentTime)} / {formatTime(videoDuration)}
            </span>

            {/* Custom Interactive Timeline Scrubber */}
            <div
              onPointerDown={handleScrubStart}
              onPointerMove={handleScrubMove}
              onPointerUp={handleScrubEnd}
              onPointerCancel={handleScrubEnd}
              style={{
                flex: 1,
                height: "16px",
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                position: "relative",
                touchAction: "none",
              }}
              className={`scrub-container${isScrubbing ? " is-scrubbing" : ""}`}
            >
              <div
                style={{
                  width: "100%",
                  height: "4px",
                  background: "rgba(255, 255, 255, 0.16)",
                  borderRadius: "2px",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressPercent}%`,
                    background: "var(--accent, #38bdf8)",
                    borderRadius: "2px",
                    position: "absolute",
                    top: 0,
                    left: 0,
                  }}
                />
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    background: "#ffffff",
                    borderRadius: "50%",
                    position: "absolute",
                    top: "-3px",
                    left: `calc(${progressPercent}% - 5px)`,
                    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.4)",
                    transition: "transform 0.15s ease",
                  }}
                  className="scrub-handle"
                />
              </div>
            </div>

            {/* Volume Toggle */}
            <button
              type="button"
              onClick={handleMuteToggle}
              style={{
                background: "transparent",
                border: "none",
                color: "#ffffff",
                cursor: "pointer",
                padding: "2px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              className="player-control-btn"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "18px", height: "18px" }}>
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "18px", height: "18px" }}>
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={handleFullscreenToggle}
              style={{
                background: "transparent",
                border: "none",
                color: "#ffffff",
                cursor: "pointer",
                padding: "2px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              className="player-control-btn"
              aria-label="Toggle Fullscreen"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "18px", height: "18px" }}>
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>

            {downloadUrl && (
              <a
                id="download"
                href={downloadUrl}
                download="recording.mp4"
                title="Export MP4"
                aria-label="Export MP4"
                onClick={(e) => e.stopPropagation()}
                className="player-control-btn player-export-btn"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "18px", height: "18px" }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </a>
            )}
          </div>
        </div>

        {duration && (
          <div className="meta capture-meta">
            <span id="duration">{duration}</span>
            {scrollStrategy && (
              <span className={`scroll-strategy-badge scroll-strategy-${scrollStrategy}`}>
                {scrollStrategy === "virtual" ? "Virtual scroll" : "Document scroll"}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`result-container capture-window${isPortrait ? " is-portrait-device" : " is-landscape-device"}`}
      style={previewVars}
    >
      <div
        key={`${width}x${height}`}
        className={`video-preview-wrapper is-state-${previewState}${isPortrait ? " is-portrait" : " is-landscape"}${isSubmitting ? " is-recording" : ""}`}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "var(--surface-variant)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
        }}
      >
        <div
          className={`browser-content${isPortrait ? " is-portrait-preview" : " is-landscape-preview"}`}
          style={{ paddingBottom: `${(height / width) * 100}%`, position: "relative" }}
        >
          {isSubmitting ? (
            <div
              className="browser-placeholder browser-placeholder-recording"
              role="status"
              aria-live="polite"
              aria-label={`Recording ${shortUrl}`}
            >
              <span className="rec-dot" aria-hidden />
              <p className="rec-label">Recording</p>
              <p className="rec-detail">
                {recordingElapsed || "0.0s"}
                <span className="rec-detail-sep" aria-hidden>
                  ·
                </span>
                {shortUrl}
              </p>
            </div>
          ) : (
            <div className="browser-placeholder browser-placeholder-idle">
              <span className="idle-viewport-badge">
                {width} × {height}
              </span>
              <div className="placeholder-title">Ready to capture</div>
              <p className="idle-preview-url">{displayUrl}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
