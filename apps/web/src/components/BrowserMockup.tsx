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
  recordingPercent?: number;
  recordingStatus?: string;
  
  // Real-time animation props
  scrollCurvePreset?: string;
  scrollCurveBezier?: [number, number, number, number];
  durationMs?: number;
  
  // Real-time styling overrides
  shadowBlur?: number;
  shadowSpread?: number;
  cornerRadiusOverride?: number;
}

const CURVES: Record<string, [number, number, number, number]> = {
  "linear": [0, 0, 1, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
  "ease-in-cubic": [0.55, 0.055, 0.675, 0.19],
  "ease-out-cubic": [0.215, 0.61, 0.355, 1],
  "ease-in-out-cubic": [0.645, 0.045, 0.355, 1]
};

function solveCubicBezier(t: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  if (p1x === p1y && p2x === p2y) return t; // linear shortcut
  let x = t;
  for (let i = 0; i < 8; i++) {
    const currentX = 3 * (1 - x) * (1 - x) * x * p1x + 3 * (1 - x) * x * x * p2x + x * x * x;
    const derivative = 3 * (1 - x) * (1 - x) * p1x + 6 * (1 - x) * x * (p2x - p1x) + 3 * x * x * (1 - p2x);
    if (Math.abs(derivative) < 1e-6) break;
    x -= (currentX - t) / derivative;
  }
  return 3 * (1 - x) * (1 - x) * x * p1y + 3 * (1 - x) * x * x * p2y + x * x * x;
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
  recordingPercent = 0,
  recordingStatus,
  scrollCurvePreset,
  scrollCurveBezier,
  durationMs,
  shadowBlur,
  shadowSpread,
  cornerRadiusOverride,
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeContainerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // ResizeObserver to calculate scale ratio for viewport simulation
  useEffect(() => {
    if (videoUrl || isSubmitting || !url) return;
    const container = iframeContainerRef.current;
    if (!container) return;
    const handleResize = () => {
      setScale(container.clientWidth / width);
    };
    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [videoUrl, isSubmitting, url, width]);

  // Real-time iframe scroll preview loop
  useEffect(() => {
    if (videoUrl || isSubmitting || !url) return;

    let active = true;
    let animationFrameId: number;
    let lastPos = 0;
    const startTime = Date.now();
    const duration = durationMs ?? 18_000;
    const curve = scrollCurveBezier ?? CURVES[scrollCurvePreset ?? "ease-in-out"] ?? CURVES["ease-in-out"];

    const performScrollPreview = (iframe: HTMLIFrameElement, progress: number, deltaY: number) => {
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) return;

      // 1. Scroll native window
      const docEl = doc.documentElement;
      const maxWinScroll = Math.max(0, docEl.scrollHeight - iframe.clientHeight);
      if (maxWinScroll > 0) {
        win.scrollTo({ top: maxWinScroll * progress, behavior: "instant" });
      }

      // 2. Deep walk scrollable elements (e.g. custom scroll containers)
      const walk = (node: Element) => {
        if (node instanceof HTMLElement && node !== docEl && node !== doc.body) {
          const style = win.getComputedStyle(node);
          const overflow = style.overflowY || style.overflow || "";
          if ((overflow.includes("auto") || overflow.includes("scroll")) && node.scrollHeight > node.clientHeight) {
            const maxElScroll = node.scrollHeight - node.clientHeight;
            node.scrollTo({ top: maxElScroll * progress, behavior: "instant" });
          }
        }
        for (let i = 0; i < node.children.length; i++) {
          walk(node.children[i]);
        }
      };
      if (doc.body) {
        walk(doc.body);
      }

      // 3. Dispatch synthetic wheel event (for virtual scroll frameworks)
      if (Math.abs(deltaY) > 0.05 && doc.body) {
        const wheelEvent = new WheelEvent("wheel", {
          deltaX: 0,
          deltaY: deltaY,
          deltaMode: 0,
          bubbles: true,
          cancelable: true,
        });
        doc.body.dispatchEvent(wheelEvent);
      }
    };

    const loop = () => {
      if (!active) return;
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow && iframe.contentDocument) {
        try {
          const elapsed = (Date.now() - startTime) % (duration + 2000); // add 2s hold at bottom
          let progress = 0;
          if (elapsed < duration) {
            const t = elapsed / duration;
            progress = solveCubicBezier(t, curve[0], curve[1], curve[2], curve[3]);
          } else {
            progress = 1; // hold at bottom
          }

          // Reset delta tracking when loop wraps around to top
          if (elapsed < 50) {
            lastPos = 0;
          }

          const docEl = iframe.contentDocument.documentElement;
          const maxWinScroll = Math.max(0, docEl.scrollHeight - iframe.clientHeight);
          const totalTravel = maxWinScroll > 0 ? maxWinScroll : 6000;
          const targetPos = totalTravel * progress;
          const deltaY = targetPos - lastPos;
          lastPos = targetPos;

          performScrollPreview(iframe, progress, deltaY);
        } catch {
          // Ignore cross-origin security issues if proxy fails
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [videoUrl, isSubmitting, url, scrollCurvePreset, JSON.stringify(scrollCurveBezier), durationMs]);

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
        {/* Outer shell holds drop-shadow (must not use overflow/clip-path). */}
        <div
          className="video-card-shell"
          style={shadowBlur !== undefined && shadowSpread !== undefined ? {
            boxShadow: `0 ${shadowBlur}px ${shadowSpread}px rgba(0, 0, 0, 0.15)`
          } : undefined}
        >
        <div
          ref={containerRef}
          onClick={() => handlePlayPause()}
          className="custom-video-player-container"
          style={cornerRadiusOverride !== undefined ? {
            borderRadius: `${cornerRadiusOverride}px`
          } : undefined}
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
              objectFit: "cover",
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
                    background: "var(--accent, #6b8cff)",
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
          borderRadius: `${cornerRadiusOverride !== undefined ? cornerRadiusOverride : 12}px`,
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "var(--surface-variant)",
          boxShadow: shadowBlur !== undefined && shadowSpread !== undefined
            ? `0 ${shadowBlur}px ${shadowSpread}px rgba(0, 0, 0, 0.15)`
            : "0 10px 30px rgba(0, 0, 0, 0.15)",
        }}
      >
        <div
          ref={iframeContainerRef}
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
              <div className="rec-card">
                <div className="rec-card-top">
                  <span className="rec-pill">
                    <span className="rec-dot" aria-hidden />
                    REC
                  </span>
                  <span className="rec-elapsed-chip">
                    {recordingElapsed || "0.0s"}
                  </span>
                </div>
                <p className="rec-label">Capturing scroll</p>
                <p className="rec-detail" title={displayUrl}>
                  {shortUrl}
                </p>
                <div className="rec-progress">
                  <div className="rec-progress-track">
                    <div
                      className="rec-progress-fill"
                      style={{
                        width: `${Math.max(0, Math.min(100, recordingPercent))}%`,
                      }}
                    />
                  </div>
                  <div className="rec-progress-meta">
                    <span className="rec-progress-status">
                      {recordingStatus || "Preparing capture…"}
                    </span>
                    <span className="rec-progress-pct">
                      {Math.max(0, Math.min(100, Math.round(recordingPercent)))}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : url ? (
            <iframe
              ref={iframeRef}
              src={`/api/proxy?url=${encodeURIComponent(url)}`}
              className="preview-iframe"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: `${width}px`,
                height: `${height}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                border: 0,
                background: "var(--surface-variant)",
                pointerEvents: "none",
              }}
              title="Real-time Scroll Preview"
            />
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
