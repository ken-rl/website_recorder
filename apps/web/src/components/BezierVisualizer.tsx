import React, { useRef, useEffect, useState } from "react";

export interface Curve {
  id: string;
  label: string;
  desc: string;
  bezier: [number, number, number, number];
  wide?: boolean;
}

export const CURVES: Curve[] = [
  {
    id: "linear",
    label: "Linear",
    desc: "Constant speed",
    bezier: [0, 0, 1, 1],
  },
  {
    id: "ease-in",
    label: "Ease in",
    desc: "Slow start",
    bezier: [0.65, 0, 1, 0.45],
  },
  {
    id: "ease-out",
    label: "Ease out",
    desc: "Slow end",
    bezier: [0, 0, 0.58, 1],
  },
  {
    id: "ease-in-out",
    label: "Ease in-out",
    desc: "Slow start & end",
    bezier: [0.42, 0, 0.58, 1],
  },
  {
    id: "ease-in-cubic",
    label: "In cubic",
    desc: "Strong slow start",
    bezier: [0.55, 0.055, 0.675, 0.19],
  },
  {
    id: "ease-out-cubic",
    label: "Out cubic",
    desc: "Strong slow end",
    bezier: [0.215, 0.61, 0.355, 1],
  },
  {
    id: "ease-in-out-cubic",
    label: "In-out cubic",
    desc: "Heavy easing",
    bezier: [0.645, 0.045, 0.355, 1],
  },
  {
    id: "custom",
    label: "Custom",
    desc: "Cubic bezier input",
    bezier: [0.42, 0, 0.58, 1],
    wide: true,
  },
];

interface BezierVisualizerProps {
  selectedCurve: string;
  setSelectedCurve: (c: string) => void;
  customBezier: [number, number, number, number];
  setCustomBezier: (b: [number, number, number, number]) => void;
  customInputText: string;
  setCustomInputText: (t: string) => void;
  embedded?: boolean;
  pixelsPerFrame?: number;
}

export function sampleCurveY(
  bezier: [number, number, number, number],
  linearProgress: number,
) {
  const [x1, y1, x2, y2] = bezier;

  function sampleX(t: number) {
    const inv = 1 - t;
    return 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t;
  }

  // Explicitly type parameter name inside functions to avoid compile issues
  function sampleYVal(t: number) {
    const inv = 1 - t;
    return 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t;
  }

  function sampleDx(t: number) {
    return (
      3 * (1 - t) * (1 - t) * x1 +
      6 * (1 - t) * t * (x2 - x1) +
      3 * t * t * (1 - x2)
    );
  }

  if (linearProgress <= 0) return 0;
  if (linearProgress >= 1) return 1;

  let start = 0;
  let end = 1;
  let param = linearProgress;

  for (let i = 0; i < 8; i += 1) {
    param = (start + end) / 2;
    if (sampleX(param) < linearProgress) start = param;
    else end = param;
  }

  param = (start + end) / 2;
  const dx = sampleDx(param);
  if (Math.abs(dx) > 1e-6) {
    param -= (sampleX(param) - linearProgress) / dx;
  }

  return sampleYVal(Math.min(1, Math.max(0, param)));
}

export default function BezierVisualizer({
  selectedCurve,
  setSelectedCurve,
  customBezier,
  setCustomBezier,
  customInputText,
  setCustomInputText,
  embedded = false,
  pixelsPerFrame = 16,
}: BezierVisualizerProps) {
  const [hoveredHandle, setHoveredHandle] = useState<number | null>(null);
  const activeDragHandle = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previewFrame = useRef(0);

  const getSelectedBezier = (): [number, number, number, number] => {
    if (selectedCurve === "custom") {
      return customBezier;
    }
    const match = CURVES.find((c) => c.id === selectedCurve);
    return match ? match.bezier : [0, 0, 1, 1];
  };

  function curvePoints(
    bezier: [number, number, number, number],
    width: number,
    height: number,
    padding: number,
  ) {
    const points = [];
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;

    for (let i = 0; i <= 120; i += 1) {
      const t = i / 120;
      const y = sampleCurveY(bezier, t);
      points.push({
        x: padding + t * innerW,
        y: padding + innerH - y * innerH,
      });
    }
    return points;
  }

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function render() {
      if (!canvas || !ctx) return;
      const bezier = getSelectedBezier();
      const [x1, y1, x2, y2] = bezier;
      const width = canvas.width;
      const height = canvas.height;
      const padding = 24;
      const innerW = 316;
      const innerH = 132;

      const compStyle = window.getComputedStyle(canvas);
      const textCol = compStyle.getPropertyValue("--text-primary").trim() || "#ffffff";
      const isLightTheme = textCol.includes("0, 0, 0") || textCol.startsWith("#0") || textCol.startsWith("#1") || textCol.startsWith("#2") || textCol.startsWith("#3") || textCol.startsWith("#4") || textCol.startsWith("#5") || textCol.includes("rgb(17") || textCol.includes("rgb(34");
      
      const themeColor = isLightTheme ? "#111827" : "#ffffff";
      const themeColorRgb = isLightTheme ? "17, 24, 39" : "255, 255, 255";

      const points = curvePoints(bezier, 364, height, padding);

      const fps = 60; // Assuming requestAnimationFrame target is 60fps
      // Dynamic duration based on velocity: 18 px/frame is standard (takes 240 frames)
      const scrollFrames = Math.max(60, Math.round(4320 / pixelsPerFrame));
      const startPauseFrames = 1 * fps; // 1s pause at top
      const endPauseFrames = 1.5 * fps; // 1.5s pause at bottom
      const totalFrames = startPauseFrames + scrollFrames + endPauseFrames;
      const currentFrame = previewFrame.current % totalFrames;
      let t = 0;

      if (currentFrame < startPauseFrames) {
        t = 0;
      } else if (currentFrame >= startPauseFrames + scrollFrames) {
        t = 1;
      } else {
        t = (currentFrame - startPauseFrames) / scrollFrames;
      }

      const eased = sampleCurveY(bezier, t);
      const marker = {
        x: padding + t * innerW,
        y: padding + innerH - eased * innerH,
      };

      ctx.clearRect(0, 0, width, height);

      // 1. Draw separator
      ctx.strokeStyle = `rgba(${themeColorRgb}, 0.1)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(380, 16);
      ctx.lineTo(380, height - 16);
      ctx.stroke();

      // 2. Draw grids
      ctx.strokeStyle = `rgba(${themeColorRgb}, 0.04)`;
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        const y = padding + (i / 4) * innerH;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + innerW, y);
        ctx.stroke();

        const x = padding + (i / 4) * innerW;
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, padding + innerH);
        ctx.stroke();
      }

      // 3. Draw border
      ctx.strokeStyle = "var(--border)";
      ctx.lineWidth = 1;
      ctx.strokeRect(padding, padding, innerW, innerH);

      // 4. Draw control lines
      const cx1 = padding + x1 * innerW;
      const cy1 = padding + (1 - y1) * innerH;
      const cx2 = padding + x2 * innerW;
      const cy2 = padding + (1 - y2) * innerH;

      ctx.strokeStyle = `rgba(${themeColorRgb}, 0.25)`;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(padding, padding + innerH);
      ctx.lineTo(cx1, cy1);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padding + innerW, padding);
      ctx.lineTo(cx2, cy2);
      ctx.stroke();

      ctx.setLineDash([]);

      // 5. Draw curve
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      points.forEach((pt, index) => {
        if (index === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      // 6. Draw handles
      let g1 =
        hoveredHandle === 1 || activeDragHandle.current === 1 ? 0.35 : 0.15;
      ctx.fillStyle = `rgba(${themeColorRgb}, ${g1})`;
      ctx.beginPath();
      ctx.arc(cx1, cy1, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = themeColor;
      ctx.beginPath();
      ctx.arc(cx1, cy1, 4.5, 0, Math.PI * 2);
      ctx.fill();

      let g2 =
        hoveredHandle === 2 || activeDragHandle.current === 2 ? 0.35 : 0.15;
      ctx.fillStyle = `rgba(${themeColorRgb}, ${g2})`;
      ctx.beginPath();
      ctx.arc(cx2, cy2, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = themeColor;
      ctx.beginPath();
      ctx.arc(cx2, cy2, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // 7. Draw marker
      ctx.fillStyle = themeColor;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${themeColorRgb}, 0.15)`;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 10, 0, Math.PI * 2);
      ctx.fill();

      // 8. Draw simulator
      const simX = 398;
      const simY = padding;
      const simW = 138;
      const simH = innerH;
      const headerH = 14;

      ctx.fillStyle = "var(--surface)";
      ctx.fillRect(simX, simY, simW, simH);

      ctx.fillStyle = `rgba(${themeColorRgb}, 0.03)`;
      ctx.fillRect(simX, simY, simW, headerH);

      ctx.strokeStyle = "var(--border)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(simX, simY + headerH);
      ctx.lineTo(simX + simW, simY + headerH);
      ctx.stroke();

      ctx.fillStyle = `rgba(${themeColorRgb}, 0.2)`;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(simX + 10 + i * 5, simY + headerH / 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(simX, simY + headerH, simW, simH - headerH);
      ctx.clip();

      const pageHeight = 320;
      const maxScroll = pageHeight - (simH - headerH);
      const scrollY = eased * maxScroll;

      for (let y = 10; y < pageHeight; y += 16) {
        const elemY = simY + headerH + y - scrollY;

        if (y === 26 || y === 122 || y === 218) {
          ctx.fillStyle = `rgba(${themeColorRgb}, 0.05)`;
          ctx.fillRect(simX + 10, elemY, simW - 20, 24);
          y += 18;
        } else if (y === 58 || y === 154 || y === 250) {
          ctx.fillStyle = `rgba(${themeColorRgb}, 0.25)`;
          ctx.fillRect(simX + 10, elemY, 50, 4);
        } else {
          ctx.fillStyle = `rgba(${themeColorRgb}, 0.12)`;
          const lineW = y % 3 === 0 ? 90 : y % 2 === 0 ? 75 : 105;
          ctx.fillRect(simX + 10, elemY, Math.min(lineW, simW - 20), 2.5);
        }
      }

      ctx.restore();

      ctx.strokeStyle = "var(--border)";
      ctx.lineWidth = 1.25;
      ctx.strokeRect(simX, simY, simW, simH);

      const sbHeight = ((simH - headerH) / pageHeight) * (simH - headerH);
      const sbY =
        simY + headerH + (scrollY / maxScroll) * (simH - headerH - sbHeight);
      ctx.fillStyle = `rgba(${themeColorRgb}, 0.25)`;
      ctx.fillRect(simX + simW - 3, sbY, 1.5, sbHeight);

      previewFrame.current += 1;
      animationFrameRef.current = requestAnimationFrame(render);
    }

    render();

    return () => {
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
    };
  }, [selectedCurve, customBezier, hoveredHandle, pixelsPerFrame]);

  function getPosFromEvent(
    e:
      React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function handleInteractionStart(
    e:
      React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) {
    const pos = getPosFromEvent(e);
    if (!pos) return;

    const [x1, y1, x2, y2] = getSelectedBezier();
    const padding = 24;
    const innerW = 316;
    const innerH = 132;

    const cx1 = padding + x1 * innerW;
    const cy1 = padding + (1 - y1) * innerH;
    const cx2 = padding + x2 * innerW;
    const cy2 = padding + (1 - y2) * innerH;

    const dist1 = Math.hypot(pos.x - cx1, pos.y - cy1);
    const dist2 = Math.hypot(pos.x - cx2, pos.y - cy2);

    const hitRadius = 18;
    if (dist1 < hitRadius && dist1 < dist2) {
      activeDragHandle.current = 1;
      if (e.cancelable) e.preventDefault();
    } else if (dist2 < hitRadius) {
      activeDragHandle.current = 2;
      if (e.cancelable) e.preventDefault();
    }
  }

  function handleInteractionMove(
    e:
      React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) {
    const pos = getPosFromEvent(e);
    if (!pos) return;

    const padding = 24;
    const innerW = 316;
    const innerH = 132;

    if (activeDragHandle.current) {
      if (e.cancelable) e.preventDefault();
      let x = (pos.x - padding) / innerW;
      let y = 1 - (pos.y - padding) / innerH;

      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));

      let nextBezier: [number, number, number, number];
      if (selectedCurve !== "custom") {
        const active = getSelectedBezier();
        nextBezier = [...active];
        setSelectedCurve("custom");
      } else {
        nextBezier = [...customBezier];
      }

      if (activeDragHandle.current === 1) {
        nextBezier[0] = Number(x.toFixed(2));
        nextBezier[1] = Number(y.toFixed(2));
      } else {
        nextBezier[2] = Number(x.toFixed(2));
        nextBezier[3] = Number(y.toFixed(2));
      }

      setCustomBezier(nextBezier);
      setCustomInputText(nextBezier.map((n) => n.toFixed(2)).join(", "));
    } else {
      const [x1, y1, x2, y2] = getSelectedBezier();
      const cx1 = padding + x1 * innerW;
      const cy1 = padding + (1 - y1) * innerH;
      const cx2 = padding + x2 * innerW;
      const cy2 = padding + (1 - y2) * innerH;

      const dist1 = Math.hypot(pos.x - cx1, pos.y - cy1);
      const dist2 = Math.hypot(pos.x - cx2, pos.y - cy2);

      const hitRadius = 18;
      if (dist1 < hitRadius && dist1 < dist2) {
        setHoveredHandle(1);
      } else if (dist2 < hitRadius) {
        setHoveredHandle(2);
      } else {
        setHoveredHandle(null);
      }
    }
  }

  function handleInteractionEnd() {
    activeDragHandle.current = null;
  }

  return (
    <div
      className={`curve-preview${embedded ? " curve-preview-embedded" : ""}`}
    >
      <div className="curve-preview-head">
        <strong id="previewLabel">
          {CURVES.find((c) => c.id === selectedCurve)?.label || "Custom"}
        </strong>
        <span id="previewDesc">
          {selectedCurve === "custom"
            ? `cubic-bezier(${customBezier.map((n) => n.toFixed(2)).join(", ")})`
            : CURVES.find((c) => c.id === selectedCurve)?.desc}
        </span>
      </div>
      <div className="canvas-container">
        <canvas
          id="curvePreview"
          ref={canvasRef}
          className="curve-preview-canvas"
          width="560"
          height="180"
          onMouseDown={handleInteractionStart}
          onMouseMove={handleInteractionMove}
          onMouseUp={handleInteractionEnd}
          onMouseLeave={handleInteractionEnd}
          onTouchStart={handleInteractionStart}
          onTouchMove={handleInteractionMove}
          onTouchEnd={handleInteractionEnd}
          onTouchCancel={handleInteractionEnd}
        />
      </div>
      <p className="canvas-tip">
        Drag the white handle points on the grid to visually customize the
        curve.
      </p>
    </div>
  );
}
