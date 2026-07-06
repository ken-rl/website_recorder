import { Info } from "lucide-react";
import React from "react";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export default function InfoTooltip({ text, className }: InfoTooltipProps) {
  return (
    <span className={`info-tooltip${className ? ` ${className}` : ""}`}>
      <button type="button" className="info-tooltip-trigger" aria-label={text}>
        <Info size={13} strokeWidth={2} aria-hidden />
      </button>
      <span role="tooltip" className="info-tooltip-content">
        {text}
      </span>
    </span>
  );
}
