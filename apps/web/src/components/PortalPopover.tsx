import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

interface PortalPopoverProps {
  triggerRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  align?: "right" | "left" | "top" | "bottom";
  offset?: number;
  style?: React.CSSProperties;
  className?: string;
  closeDelay?: number;
}

export default function PortalPopover({
  triggerRef,
  open,
  onClose,
  children,
  align = "right",
  offset = 12,
  style,
  className,
  closeDelay = 150,
}: PortalPopoverProps) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const [hoveringContent, setHoveringContent] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRectRef = useRef<DOMRect | null>(null);
  const contentElRef = useRef<HTMLDivElement>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setVisible(false);
    }, closeDelay);
  }, [cancelClose, closeDelay]);

  const markHovered = useCallback(() => {
    setHoveringContent(true);
    cancelClose();
  }, [cancelClose]);

  const markUnhovered = useCallback(() => {
    setHoveringContent(false);
  }, []);

  useEffect(() => {
    if (open) {
      cancelClose();
      setVisible(true);
    } else if (!hoveringContent) {
      scheduleClose();
    }
  }, [open, cancelClose, scheduleClose]);

  useEffect(() => {
    if (hoveringContent) {
      cancelClose();
    } else if (!open && visible) {
      scheduleClose();
    }
  }, [hoveringContent, open, visible, cancelClose, scheduleClose]);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    triggerRectRef.current = rect;
    switch (align) {
      case "right":
        setPos({ top: rect.top, left: rect.right + offset });
        break;
      case "left":
        setPos({ top: rect.top, left: rect.left - offset });
        break;
      case "top":
        setPos({ top: rect.top - offset, left: rect.left + rect.width / 2 });
        break;
      case "bottom":
        setPos({ top: rect.bottom + offset, left: rect.left + rect.width / 2 });
        break;
    }
  }, [triggerRef, align, offset]);

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [visible, updatePosition]);

  useEffect(() => {
    if (!open || !onClose) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelClose();
        setHoveringContent(false);
        setVisible(false);
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, cancelClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (!visible) return null;

  const t = triggerRectRef.current;

  let bridgeStyle: React.CSSProperties | null = null;

  if (align === "right" && t) {
    bridgeStyle = {
      position: "fixed",
      left: t.right,
      top: t.top,
      width: Math.max(0, pos.left - t.right),
      height: t.height,
      zIndex: 9998,
    };
  }

  return createPortal(
    <>
      {bridgeStyle && (
        <div
          style={bridgeStyle}
          onMouseEnter={markHovered}
          onMouseLeave={markUnhovered}
        />
      )}
      <div
        ref={contentElRef}
        className={className}
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          zIndex: 9999,
          ...style,
        }}
        onMouseEnter={markHovered}
        onMouseLeave={markUnhovered}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
