import React from "react";

interface BrowserMockupProps {
  url: string;
  videoUrl: string | null;
  duration: string | null;
  scrollStrategy?: "document" | "virtual";
  isEdited?: boolean;
  onOpenEditor?: () => void;
  width: number;
  height: number;
  isSubmitting: boolean;
  statusType: string;
}

export default function BrowserMockup({
  url,
  videoUrl,
  duration,
  scrollStrategy,
  isEdited,
  onOpenEditor,
  width,
  height,
  isSubmitting,
}: BrowserMockupProps) {
  const isMobile = width < height;
  const displayUrl = url || "https://example.com";

  return (
    <div className="result-container capture-window">
      <div
        className={`browser-mockup capture-browser${isMobile ? " is-mobile" : ""}${isSubmitting ? " is-recording" : ""}${videoUrl ? " has-video" : ""}`}
        style={{
          maxWidth: isMobile ? "280px" : "100%",
          margin: isMobile ? "0 auto" : "0",
        }}
      >
        <div className="browser-header">
          <div className="browser-dots" aria-hidden>
            <span className="dot dot-close" />
            <span className="dot dot-min" />
            <span className="dot dot-max" />
          </div>
          <div className="browser-address-bar" id="browserAddressBar">
            <svg
              className="browser-lock"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="browser-url-text">{displayUrl}</span>
          </div>
          <div className="browser-actions">
            {videoUrl && (
              <a
                id="download"
                href={videoUrl}
                download="recording.mp4"
                title="Download video file"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </a>
            )}
          </div>
        </div>

        <div
          className="browser-content"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          {isSubmitting && <div className="browser-scanline" aria-hidden />}

          {videoUrl ? (
            <div className="browser-media">
              <video id="player" src={videoUrl} controls autoPlay playsInline />
            </div>
          ) : (
            <div className="browser-placeholder">
              <div className="placeholder-visual">
                <svg
                  className={`placeholder-icon${isSubmitting ? " pulsating" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {isSubmitting && (
                  <span className="placeholder-recording-ring" aria-hidden />
                )}
              </div>
              <div className="placeholder-title">
                {isSubmitting ? "Capturing active view" : "Awaiting capture"}
              </div>
              <div className="placeholder-desc">
                {isSubmitting
                  ? "Playwright is scrolling and recording the target URL."
                  : "Set your target URL, then press Start Capture."}
              </div>
            </div>
          )}
        </div>

        <div className="browser-footer-bar">
          <span className="browser-footer-label">Viewport</span>
          <span className="browser-footer-value">
            {width} × {height}
          </span>
        </div>
      </div>

      {duration && (
        <div className="meta capture-meta">
          <span id="duration">Completed in {duration}</span>
          <div className="meta-actions">
            <span className="meta-badges">
              {scrollStrategy && (
                <span
                  className={`scroll-strategy-badge scroll-strategy-${scrollStrategy}`}
                >
                  {scrollStrategy === "virtual"
                    ? "Virtual scroll"
                    : "Document scroll"}
                </span>
              )}
              {isEdited && (
                <span className="scroll-strategy-badge scroll-strategy-edited">
                  Edited
                </span>
              )}
            </span>
            {onOpenEditor && (
              <button
                type="button"
                className="open-editor-btn"
                onClick={onOpenEditor}
              >
                Open in Editor
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
