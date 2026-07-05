import React from "react";

interface ProgressCardProps {
  percent: number;
  status: string;
  elapsed: string;
}

export default function ProgressCard({ percent, status, elapsed }: ProgressCardProps) {
  if (percent === 0) return null;
  return (
    <div className="progress-card" id="progressCard">
      <div className="progress-header">
        <span className="progress-title" id="progressTitle">Capturing Website</span>
        <span className="progress-percent" id="progressPercent">{percent}%</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" id="progressBarFill" style={{ width: `${percent}%` }}></div>
      </div>
      <div className="progress-footer">
        <span className="progress-status" id="progressStatus">{status}</span>
        <span className="progress-timer" id="progressTimer">{elapsed}</span>
      </div>
    </div>
  );
}
