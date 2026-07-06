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
  statusType,
}: BrowserMockupProps) {
  const isMobile = width < height;

  return (
    <div className="result-container" style={{ marginTop: "1.5rem" }}>
      <div
        className={`browser-mockup${isMobile ? " is-mobile" : ""}`}
        style={{
          maxWidth: isMobile ? "280px" : "100%",
          margin: isMobile ? "0 auto" : "0",
        }}
      >
        <div className="browser-header">
          <div className="browser-dots">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
          <div className="browser-address-bar" id="browserAddressBar">
            {url || "https://example.com"}
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
          {videoUrl ? (
            <div className="browser-media">
              <video id="player" src={videoUrl} controls autoPlay playsInline />
            </div>
          ) : (
            <div className="browser-placeholder">
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
              <div className="placeholder-title">
                {isSubmitting
                  ? "Capturing Active View..."
                  : "Capture Target Preview"}
              </div>
              <div className="placeholder-desc">
                {isSubmitting
                  ? "Playwright is scrolling and recording the target URL."
                  : "Set parameters on the left and click 'Start Capture' to record."}
              </div>
            </div>
          )}
        </div>
      </div>
      {duration && (
        <div className="meta">
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
