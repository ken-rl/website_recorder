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
  const text = style.getPropertyValue("--text").trim() || (isLight ? "#171914" : "#f4f1e8");
  const muted = style.getPropertyValue("--muted").trim() || (isLight ? "#5f6259" : "#9b9d92");
  const border = style.getPropertyValue("--border").trim() || (isLight ? "#d7d3c7" : "rgba(244,241,232,0.08)");
  const surface = style.getPropertyValue("--surface").trim() || (isLight ? "#faf8f1" : "#151713");
  const surfaceMuted =
    style.getPropertyValue("--surface-muted").trim() ||
    style.getPropertyValue("--surface-elevated").trim() ||
    (isLight ? "#f2f0e8" : "#1a1d18");
  const accent = style.getPropertyValue("--accent").trim() || (isLight ? "#3158c9" : "#6b8cff");
  const bg = style.getPropertyValue("--bg").trim() || (isLight ? "#eeece3" : "#0d0f0c");

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
  const [simHover, setSimHover] = useState(false);
  const [simPos, setSimPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [themeKey, setThemeKey] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.getAttribute("data-theme") || "dark"
      : "dark",
  );
  const activeDragHandle = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previewFrame = useRef(0);
  const graphLayoutRef = useRef({ padding: 20, innerW: 440, innerH: 160 });

  const updateSimPosition = () => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const panelW = 220;
    const panelH = 320;
    const gap = 12;
    const spaceRight = window.innerWidth - rect.right - gap;
    let left: number;
    let top: number;
    if (spaceRight >= panelW + 8) {
      // Float into the main stage to the right of the graph
      left = rect.right + gap;
      top = rect.top + rect.height / 2 - panelH / 2;
    } else {
      // Narrow layout: sit under the graph
      left = rect.left + Math.max(0, (rect.width - panelW) / 2);
      top = rect.bottom + gap;
    }
    top = Math.max(12, Math.min(top, window.innerHeight - panelH - 12));
    left = Math.max(12, Math.min(left, window.innerWidth - panelW - 12));
    setSimPos({ top, left });
  };

  useEffect(() => {
    if (!simHover) {
      setSimPos(null);
      return;
    }
    updateSimPosition();
    const onScrollOrResize = () => updateSimPosition();
    window.addEventListener("resize", onScrollOrResize);
    // Capture scroll from nested sidebar
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [simHover]);
  const paletteRef = useRef<CurveCanvasPalette>(
    typeof document !== "undefined"
      ? readCurveCanvasPalette()
      : {
          isLight: false,
          ink: "#f4f1e8",
          inkRgb: "244, 241, 232",
          accent: "#6b8cff",
          accentRgb: "107, 140, 255",
          border: "rgba(244,241,232,0.12)",
          surface: "#151713",
          surfaceMuted: "#1a1d18",
          grid: "rgba(244,241,232,0.06)",
          control: "rgba(244,241,232,0.28)",
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

  // Draw loop — full-width graph + optional larger scroll preview canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function drawScrollSim(
      simCtx: CanvasRenderingContext2D,
      simW: number,
      simH: number,
      eased: number,
      palette: CurveCanvasPalette,
    ) {
      const headerH = 22;
      const pad = 12;

      simCtx.clearRect(0, 0, simW, simH);

      // Card body
      simCtx.fillStyle = palette.surface;
      if (typeof simCtx.roundRect === "function") {
        simCtx.beginPath();
        simCtx.roundRect(0, 0, simW, simH, 12);
        simCtx.fill();
      } else {
        simCtx.fillRect(0, 0, simW, simH);
      }

      // Chrome
      simCtx.fillStyle = palette.simChrome;
      simCtx.fillRect(0, 0, simW, headerH);
      simCtx.strokeStyle = palette.border;
      simCtx.lineWidth = 1;
      simCtx.beginPath();
      simCtx.moveTo(0, headerH);
      simCtx.lineTo(simW, headerH);
      simCtx.stroke();

      const dots = palette.isLight
        ? ["#ff5f57", "#febc2e", "#28c840"]
        : null;
      for (let i = 0; i < 3; i++) {
        simCtx.fillStyle = dots
          ? dots[i]
          : `rgba(${palette.inkRgb}, 0.28)`;
        simCtx.beginPath();
        simCtx.arc(12 + i * 9, headerH / 2, 2.5, 0, Math.PI * 2);
        simCtx.fill();
      }

      simCtx.fillStyle = `rgba(${palette.inkRgb}, 0.35)`;
      simCtx.font = "600 10px system-ui, sans-serif";
      simCtx.textAlign = "center";
      simCtx.textBaseline = "middle";
      simCtx.fillText("Scroll preview", simW / 2, headerH / 2);

      // Page content
      simCtx.save();
      simCtx.beginPath();
      simCtx.rect(0, headerH, simW, simH - headerH);
      simCtx.clip();

      simCtx.fillStyle = palette.isLight
        ? "#f8fafc"
        : `rgba(${palette.inkRgb}, 0.03)`;
      simCtx.fillRect(0, headerH, simW, simH - headerH);

      const pageHeight = Math.max(simH * 2.1, 420);
      const viewH = simH - headerH;
      const maxScroll = Math.max(1, pageHeight - viewH);
      const scrollY = eased * maxScroll;

      for (let y = 14; y < pageHeight; y += 18) {
        const elemY = headerH + y - scrollY;
        if (elemY > simH + 40 || elemY < headerH - 40) {
          if (y === 36 || y === 140 || y === 250 || y === 360) y += 28;
          continue;
        }

        if (y === 36 || y === 140 || y === 250 || y === 360) {
          simCtx.fillStyle = palette.simBlock;
          simCtx.fillRect(pad, elemY, simW - pad * 2, 36);
          y += 28;
        } else if (y === 78 || y === 188 || y === 298) {
          simCtx.fillStyle = palette.simTitle;
          simCtx.fillRect(pad, elemY, Math.min(72, simW * 0.4), 5);
        } else {
          simCtx.fillStyle = palette.simLine;
          const lineW =
            y % 3 === 0 ? simW * 0.72 : y % 2 === 0 ? simW * 0.55 : simW * 0.82;
          simCtx.fillRect(pad, elemY, Math.min(lineW, simW - pad * 2), 3);
        }
      }

      simCtx.restore();

      // Outer border
      simCtx.strokeStyle = palette.border;
      simCtx.lineWidth = 1.25;
      if (typeof simCtx.roundRect === "function") {
        simCtx.beginPath();
        simCtx.roundRect(0.5, 0.5, simW - 1, simH - 1, 12);
        simCtx.stroke();
      } else {
        simCtx.strokeRect(0.5, 0.5, simW - 1, simH - 1);
      }
    }

    function render() {
      if (!canvas || !ctx) return;
      const palette = paletteRef.current;
      const bezier = getSelectedBezier();
      const [x1, y1, x2, y2] = bezier;
      const width = canvas.width;
      const height = canvas.height;
      const padding = 20;
      const innerW = width - padding * 2;
      const innerH = height - padding * 2;
      graphLayoutRef.current = { padding, innerW, innerH };

      const curveColor = palette.isLight ? palette.accent : palette.ink;
      const curveRgb = palette.isLight ? palette.accentRgb : palette.inkRgb;

      const points = curvePoints(bezier, width, height, padding);

      const fps = 60;
      const scrollFrames = Math.max(60, Math.round(4320 / pixelsPerFrame));
      const startPauseFrames = 1 * fps;
      const endPauseFrames = 1.5 * fps;
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

      if (palette.isLight) {
        ctx.fillStyle = palette.surfaceMuted;
        if (typeof ctx.roundRect === "function") {
          ctx.beginPath();
          ctx.roundRect(padding - 4, padding - 4, innerW + 8, innerH + 8, 10);
          ctx.fill();
        } else {
          ctx.fillRect(padding - 4, padding - 4, innerW + 8, innerH + 8);
        }
      }

      // Grid
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

      // Border
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(padding, padding, innerW, innerH);

      // Control lines
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

      // Curve
      ctx.strokeStyle = curveColor;
      ctx.lineWidth = 2.75;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      points.forEach((pt, index) => {
        if (index === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      // Handles
      const drawHandle = (cx: number, cy: number, active: boolean) => {
        ctx.fillStyle = `rgba(${curveRgb}, ${active ? 0.22 : 0.1})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.surface;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = curveColor;
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = curveColor;
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
      };
      drawHandle(
        cx1,
        cy1,
        hoveredHandle === 1 || activeDragHandle.current === 1,
      );
      drawHandle(
        cx2,
        cy2,
        hoveredHandle === 2 || activeDragHandle.current === 2,
      );

      // Progress marker
      ctx.fillStyle = `rgba(${curveRgb}, 0.16)`;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.surface;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = curveColor;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 3.75, 0, Math.PI * 2);
      ctx.fill();

      // Larger scroll preview (separate canvas, shown on hover)
      const simCanvas = simCanvasRef.current;
      if (simCanvas) {
        const simCtx = simCanvas.getContext("2d");
        if (simCtx) {
          drawScrollSim(simCtx, simCanvas.width, simCanvas.height, eased, palette);
        }
      }

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
    const { padding, innerW, innerH } = graphLayoutRef.current;

    const cx1 = padding + x1 * innerW;
    const cy1 = padding + (1 - y1) * innerH;
    const cx2 = padding + x2 * innerW;
    const cy2 = padding + (1 - y2) * innerH;

    const dist1 = Math.hypot(pos.x - cx1, pos.y - cy1);
    const dist2 = Math.hypot(pos.x - cx2, pos.y - cy2);

    const hitRadius = 20;
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

    const { padding, innerW, innerH } = graphLayoutRef.current;

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

      const hitRadius = 20;
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
      className={`curve-preview${embedded ? " curve-preview-embedded" : ""}${simHover ? " is-sim-open" : ""}`}
      onMouseEnter={() => setSimHover(true)}
      onMouseLeave={() => setSimHover(false)}
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
      <div className="canvas-container" ref={containerRef}>
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
          onTouchStart={(e) => {
            setSimHover(true);
            handleInteractionStart(e);
          }}
          onTouchMove={handleInteractionMove}
          onTouchEnd={handleInteractionEnd}
          onTouchCancel={handleInteractionEnd}
        />
      </div>
      {/* Fixed portal-like panel so sidebar overflow never clips it */}
      <div
        className={`curve-scroll-preview${simHover && simPos ? " is-visible" : ""}`}
        aria-hidden={!simHover}
        style={
          simPos
            ? { top: simPos.top, left: simPos.left }
            : undefined
        }
      >
        <canvas
          ref={simCanvasRef}
          className="curve-scroll-preview-canvas"
          width="220"
          height="320"
        />
      </div>
      <p className="canvas-tip">
        Hover for scroll preview · drag handles to customize the curve
      </p>
    </div>
  );
}
