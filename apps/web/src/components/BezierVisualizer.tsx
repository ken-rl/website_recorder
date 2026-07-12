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

/** Resolve a CSS color (including custom properties) to "r, g, b" for rgba(). */
function cssColorToRgbChannels(color: string): string {
  if (typeof document === "undefined") return "0, 0, 0";
  const probe = document.createElement("span");
  probe.style.color = color;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  const match = resolved.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!match) return "0, 0, 0";
  return `${Math.round(Number(match[1]))}, ${Math.round(Number(match[2]))}, ${Math.round(Number(match[3]))}`;
}

type CurveCanvasPalette = {
  isLight: boolean;
  ink: string;
  inkRgb: string;
  accent: string;
  accentRgb: string;
  border: string;
  surface: string;
  surfaceMuted: string;
  grid: string;
  control: string;
  simChrome: string;
  simBlock: string;
  simLine: string;
  simTitle: string;
  scrollbar: string;
};

function readCurveCanvasPalette(): CurveCanvasPalette {
  const root = document.documentElement;
  const themeAttr = root.getAttribute("data-theme");
  const isLight =
    themeAttr === "light" ||
    (!themeAttr &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);

  const style = getComputedStyle(root);
  const text = style.getPropertyValue("--text").trim() || (isLight ? "#090d16" : "#fafafa");
  const muted = style.getPropertyValue("--muted").trim() || (isLight ? "#3e4e63" : "#8e8e93");
  const border = style.getPropertyValue("--border").trim() || (isLight ? "#e2e8f0" : "rgba(255,255,255,0.07)");
  const surface = style.getPropertyValue("--surface").trim() || (isLight ? "#ffffff" : "#121214");
  const surfaceMuted =
    style.getPropertyValue("--surface-muted").trim() ||
    style.getPropertyValue("--surface-elevated").trim() ||
    (isLight ? "#f8fafc" : "#1e1e24");
  const accent = style.getPropertyValue("--accent").trim() || (isLight ? "#2563eb" : "#3b82f6");
  const bg = style.getPropertyValue("--bg").trim() || (isLight ? "#f8fafc" : "#09090b");

  const inkRgb = cssColorToRgbChannels(text);
  const accentRgb = cssColorToRgbChannels(accent);
  const mutedRgb = cssColorToRgbChannels(muted);

  if (isLight) {
    return {
      isLight: true,
      ink: text,
      inkRgb,
      accent,
      accentRgb,
      border: border.startsWith("#") || border.startsWith("rgb") ? border : "#e2e8f0",
      surface,
      surfaceMuted,
      grid: `rgba(${inkRgb}, 0.07)`,
      control: `rgba(${mutedRgb}, 0.55)`,
      simChrome: surfaceMuted,
      simBlock: `rgba(${inkRgb}, 0.06)`,
      simLine: `rgba(${inkRgb}, 0.14)`,
      simTitle: `rgba(${inkRgb}, 0.28)`,
      scrollbar: `rgba(${inkRgb}, 0.28)`,
    };
  }

  return {
    isLight: false,
    ink: text,
    inkRgb,
    accent,
    accentRgb,
    border: border.includes("rgb") || border.startsWith("#") ? border : `rgba(${inkRgb}, 0.12)`,
    surface: surface || bg,
    surfaceMuted,
    grid: `rgba(${inkRgb}, 0.06)`,
    control: `rgba(${inkRgb}, 0.28)`,
    simChrome: `rgba(${inkRgb}, 0.04)`,
    simBlock: `rgba(${inkRgb}, 0.06)`,
    simLine: `rgba(${inkRgb}, 0.14)`,
    simTitle: `rgba(${inkRgb}, 0.28)`,
    scrollbar: `rgba(${inkRgb}, 0.28)`,
  };
}

export default function BezierVisualizer({
  selectedCurve,
  setSelectedCurve,
  customBezier,
  setCustomBezier,
  embedded = false,
  pixelsPerFrame = 16,
}: BezierVisualizerProps) {
  const [hoveredHandle, setHoveredHandle] = useState<number | null>(null);
  const [themeKey, setThemeKey] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.getAttribute("data-theme") || "dark"
      : "dark",
  );
  const activeDragHandle = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previewFrame = useRef(0);
  const paletteRef = useRef<CurveCanvasPalette>(
    typeof document !== "undefined"
      ? readCurveCanvasPalette()
      : {
          isLight: false,
          ink: "#fafafa",
          inkRgb: "250, 250, 250",
          accent: "#3b82f6",
          accentRgb: "59, 130, 246",
          border: "rgba(255,255,255,0.12)",
          surface: "#121214",
          surfaceMuted: "#1e1e24",
          grid: "rgba(255,255,255,0.06)",
          control: "rgba(255,255,255,0.28)",
          simChrome: "rgba(255,255,255,0.04)",
          simBlock: "rgba(255,255,255,0.06)",
          simLine: "rgba(255,255,255,0.14)",
          simTitle: "rgba(255,255,255,0.28)",
          scrollbar: "rgba(255,255,255,0.28)",
        },
  );

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      const next = root.getAttribute("data-theme") || "dark";
      paletteRef.current = readCurveCanvasPalette();
      setThemeKey(next);
    };
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

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
      const palette = paletteRef.current;
      const bezier = getSelectedBezier();
      const [x1, y1, x2, y2] = bezier;
      const width = canvas.width;
      const height = canvas.height;
      const padding = 24;
      const innerW = 316;
      const innerH = 132;

      // Curve stroke uses brand accent in light mode for contrast; ink in dark.
      const curveColor = palette.isLight ? palette.accent : palette.ink;
      const curveRgb = palette.isLight ? palette.accentRgb : palette.inkRgb;

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

      // Soft plot background (light mode only — dark stays transparent)
      if (palette.isLight) {
        ctx.fillStyle = palette.surfaceMuted;
        ctx.beginPath();
        ctx.roundRect(padding - 4, padding - 4, innerW + 8, innerH + 8, 8);
        ctx.fill();
      }

      // 1. Draw separator
      ctx.strokeStyle = palette.isLight
        ? `rgba(${palette.inkRgb}, 0.1)`
        : `rgba(${palette.inkRgb}, 0.1)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(380, 16);
      ctx.lineTo(380, height - 16);
      ctx.stroke();

      // 2. Draw grids
      ctx.strokeStyle = palette.grid;
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
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(padding, padding, innerW, innerH);

      // 4. Draw control lines
      const cx1 = padding + x1 * innerW;
      const cy1 = padding + (1 - y1) * innerH;
      const cx2 = padding + x2 * innerW;
      const cy2 = padding + (1 - y2) * innerH;

      ctx.strokeStyle = palette.control;
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
      ctx.strokeStyle = curveColor;
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
      const handleHalo =
        hoveredHandle === 1 || activeDragHandle.current === 1 ? 0.22 : 0.1;
      ctx.fillStyle = `rgba(${curveRgb}, ${handleHalo})`;
      ctx.beginPath();
      ctx.arc(cx1, cy1, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = palette.surface;
      ctx.beginPath();
      ctx.arc(cx1, cy1, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = curveColor;
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.arc(cx1, cy1, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = curveColor;
      ctx.beginPath();
      ctx.arc(cx1, cy1, 2.75, 0, Math.PI * 2);
      ctx.fill();

      const handleHalo2 =
        hoveredHandle === 2 || activeDragHandle.current === 2 ? 0.22 : 0.1;
      ctx.fillStyle = `rgba(${curveRgb}, ${handleHalo2})`;
      ctx.beginPath();
      ctx.arc(cx2, cy2, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = palette.surface;
      ctx.beginPath();
      ctx.arc(cx2, cy2, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = curveColor;
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.arc(cx2, cy2, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = curveColor;
      ctx.beginPath();
      ctx.arc(cx2, cy2, 2.75, 0, Math.PI * 2);
      ctx.fill();

      // 7. Draw marker
      ctx.fillStyle = `rgba(${curveRgb}, 0.16)`;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = palette.surface;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = curveColor;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // 8. Draw simulator
      const simX = 398;
      const simY = padding;
      const simW = 138;
      const simH = innerH;
      const headerH = 14;

      ctx.fillStyle = palette.isLight ? palette.surface : palette.surface;
      ctx.fillRect(simX, simY, simW, simH);

      // Light mode: subtle card shadow so the sim reads against the plot
      if (palette.isLight) {
        ctx.save();
        ctx.shadowColor = "rgba(15, 23, 42, 0.08)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = palette.surface;
        ctx.fillRect(simX, simY, simW, simH);
        ctx.restore();
      }

      ctx.fillStyle = palette.simChrome;
      ctx.fillRect(simX, simY, simW, headerH);

      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(simX, simY + headerH);
      ctx.lineTo(simX + simW, simY + headerH);
      ctx.stroke();

      // Traffic lights
      const dotColors = palette.isLight
        ? ["#ff5f57", "#febc2e", "#28c840"]
        : null;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = dotColors
          ? dotColors[i]
          : `rgba(${palette.inkRgb}, 0.22)`;
        ctx.beginPath();
        ctx.arc(simX + 10 + i * 5, simY + headerH / 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(simX, simY + headerH, simW, simH - headerH);
      ctx.clip();

      // Simulated page background
      ctx.fillStyle = palette.isLight ? "#f8fafc" : `rgba(${palette.inkRgb}, 0.02)`;
      ctx.fillRect(simX, simY + headerH, simW, simH - headerH);

      const pageHeight = 320;
      const maxScroll = pageHeight - (simH - headerH);
      const scrollY = eased * maxScroll;

      for (let y = 10; y < pageHeight; y += 16) {
        const elemY = simY + headerH + y - scrollY;

        if (y === 26 || y === 122 || y === 218) {
          ctx.fillStyle = palette.simBlock;
          ctx.fillRect(simX + 10, elemY, simW - 20, 24);
          y += 18;
        } else if (y === 58 || y === 154 || y === 250) {
          ctx.fillStyle = palette.simTitle;
          ctx.fillRect(simX + 10, elemY, 50, 4);
        } else {
          ctx.fillStyle = palette.simLine;
          const lineW = y % 3 === 0 ? 90 : y % 2 === 0 ? 75 : 105;
          ctx.fillRect(simX + 10, elemY, Math.min(lineW, simW - 20), 2.5);
        }
      }

      ctx.restore();

      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1.25;
      ctx.strokeRect(simX, simY, simW, simH);

      const sbHeight = ((simH - headerH) / pageHeight) * (simH - headerH);
      const sbY =
        simY + headerH + (scrollY / maxScroll) * (simH - headerH - sbHeight);
      ctx.fillStyle = palette.scrollbar;
      ctx.fillRect(simX + simW - 3, sbY, 1.5, sbHeight);

      previewFrame.current += 1;
      animationFrameRef.current = requestAnimationFrame(render);
    }

    render();

    return () => {
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
    };
  }, [selectedCurve, customBezier, hoveredHandle, pixelsPerFrame, themeKey]);

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
        Drag the handle points on the grid to visually customize the curve.
      </p>
    </div>
  );
}
