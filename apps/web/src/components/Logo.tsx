import React from "react";

interface LogoProps {
  isRecording: boolean;
}

export default function Logo({ isRecording }: LogoProps) {
  return (
    <div className="logo-area">
      <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <circle cx="12" cy="10" r="2" fill="currentColor" />
      </svg>
      <h1>Website Recorder</h1>
      {isRecording && <div className="recording-status-dot" id="logoRecordingDot" title="Recording active" />}
    </div>
  );
}
