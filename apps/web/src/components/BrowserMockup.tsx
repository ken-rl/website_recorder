import React from "react";

interface BrowserMockupProps {
  url: string;
  videoUrl: string;
  duration: string;
  width: number;
  height: number;
}

export default function BrowserMockup({ url, videoUrl, duration, width, height }: BrowserMockupProps) {
  const isMobile = width < height;
  return (
    <div className="result visible" id="result">
      <div 
        className={`browser-mockup${isMobile ? " is-mobile" : ""}`} 
        style={{ 
          maxWidth: isMobile ? "320px" : "100%", 
          margin: isMobile ? "0 auto" : "0" 
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
            <a id="download" href={videoUrl} download="recording.mp4" title="Download video file">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </a>
          </div>
        </div>
        <div className="browser-content" style={{ aspectRatio: `${width} / ${height}` }}>
          <video id="player" src={videoUrl} controls />
        </div>
      </div>
      <div className="meta">
        <span id="duration">Completed in {duration}</span>
      </div>
    </div>
  );
}
