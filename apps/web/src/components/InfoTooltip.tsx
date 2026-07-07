import React, { useRef, useState } from "react";
import { Info } from "lucide-react";
import PortalPopover from "./PortalPopover";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export default function InfoTooltip({ text, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <span className={`info-tooltip${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="info-tooltip-trigger"
        aria-label={text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info size={13} strokeWidth={2} aria-hidden />
      </button>
      <PortalPopover
        triggerRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        align="top"
        offset={6}
        style={{ transform: "translateX(-50%)" }}
      >
        <div
          role="tooltip"
          style={{
            color: "var(--text)",
            textAlign: "left",
            whiteSpace: "normal",
            background: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--ui-radius, 8px)",
            width: "max-content",
            maxWidth: "240px",
            padding: "0.5rem 0.6rem",
            fontSize: "0.68rem",
            fontWeight: 400,
            lineHeight: 1.45,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            position: "relative",
          }}
        >
          {text}
          <div
            style={{
              borderBottom: "5px solid var(--surface-elevated)",
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              width: 0,
              height: 0,
              position: "absolute",
              bottom: "-5px",
              left: "50%",
              transform: "translateX(-50%)",
            }}
          />
        </div>
      </PortalPopover>
    </span>
  );
}
