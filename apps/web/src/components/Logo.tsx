import React from "react";

interface LogoProps {
  isRecording: boolean;
}

export default function Logo({ isRecording }: LogoProps) {
  return (
    <div className="logo-area">
      <img className="logo-icon" src="/deio-scroll-mark.svg" alt="" />
      <h1>Deio Scroll</h1>
      {isRecording && <div className="recording-status-dot" id="logoRecordingDot" title="Recording active" />}
    </div>
  );
}
