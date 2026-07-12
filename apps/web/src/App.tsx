import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Clapperboard, Play, SlidersHorizontal, Sparkles } from "lucide-react";
import AppTopbar from "./components/AppTopbar";
import { LORDICON } from "./lib/icons";
import LordIcon from "./components/LordIcon";
import TargetPageForm from "./components/TargetPageForm";
import ScrollPhysicsForm from "./components/ScrollPhysicsForm";
import VirtualScrollForm, {
  type ScrollModeOption,
} from "./components/VirtualScrollForm";
import BackgroundCanvasForm, {
  type BackgroundPreset,
} from "./components/BackgroundCanvasForm";

import ProgressCard from "./components/ProgressCard";
import BrowserMockup from "./components/BrowserMockup";
import UpcomingFeatures from "./components/UpcomingFeatures";
import EditorPage from "./pages/EditorPage";
import {
  loadEditorSession,
  saveEditorSession,
  type EditorSession,
} from "./lib/editorSession";

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    return window.location.pathname === "/editor" ? "/" : window.location.pathname;
  });
  const [editorSession, setEditorSession] = useState<EditorSession | null>(null);

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  useEffect(() => {
    const handlePopState = () => {
      let path = window.location.pathname;
      if (path === "/editor") {
        window.history.replaceState({}, "", "/");
        path = "/";
      }
      setCurrentPath(path);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    let targetPath = path;
    if (path === "/editor") {
      targetPath = "/";
    }
    window.history.pushState({}, "", targetPath);
    setCurrentPath(targetPath);
  };

  const [url, setUrl] = useState("");
  const [devicePreset, setDevicePreset] = useState("1920x1080");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);

  // Single render-quality tier: replaces fastMode + captureMode + quality
  type RenderTier = "draft" | "standard" | "cinematic";
  const [renderTier, setRenderTier] = useState<RenderTier>("standard");

  const TIER_CONFIG: Record<RenderTier, {
    captureMode: "preview" | "export";
    fastMode: boolean;
    qualityPreset: string;
    framerate: number;
    deviceScaleFactor: number;
    pixelsPerFrame: number;
    preRecordingDelayMs: number;
    defaultCycles: number;
    expectedDurationMs: number;
    label: string;
    hint: string;
  }> = {
    draft: {
      captureMode: "preview",
      fastMode: true,
      qualityPreset: "medium",
      framerate: 30,
      deviceScaleFactor: 1,
      pixelsPerFrame: 12,
      preRecordingDelayMs: 500,
      defaultCycles: 6,
      expectedDurationMs: 5000,
      label: "Draft",
      hint: "~5s · Fast Playwright recording for checking scroll feel",
    },
    standard: {
      captureMode: "export",
      fastMode: false,
      qualityPreset: "medium",
      framerate: 60,
      deviceScaleFactor: 1,
      pixelsPerFrame: 16,
      preRecordingDelayMs: 2000,
      defaultCycles: 8,
      expectedDurationMs: 25000,
      label: "Standard",
      hint: "Balanced quality (~25s)",
    },
    cinematic: {
      captureMode: "export",
      fastMode: false,
      qualityPreset: "high",
      framerate: 60,
      deviceScaleFactor: 2,
      pixelsPerFrame: 10,
      preRecordingDelayMs: 3000,
      defaultCycles: 10,
      expectedDurationMs: 55000,
      label: "Cinematic",
      hint: "High quality (~55s)",
    },
  };

  const [selectedCurve, setSelectedCurve] = useState("linear");
  const [customBezier, setCustomBezier] = useState<
    [number, number, number, number]
  >([0.42, 0, 0.58, 1]);
  const [customInputText, setCustomInputText] = useState(
    "0.42, 0.00, 0.58, 1.00",
  );

  const [scrollMode, setScrollMode] = useState<ScrollModeOption>("auto");
  const [virtualScrollCycles, setVirtualScrollCycles] = useState(8);
  const [useFixedDuration, setUseFixedDuration] = useState(false);
  const [virtualScrollDurationMs, setVirtualScrollDurationMs] = useState(30000);
  const [pixelsPerFrame, setPixelsPerFrame] = useState(16);
  const [heroHoldMs, setHeroHoldMs] = useState(1500);
  const [backgroundPreset, setBackgroundPreset] =
    useState<BackgroundPreset>("none");
  const [addShadow, setAddShadow] = useState(true);
  const [roundedCorners, setRoundedCorners] = useState(true);
  const [isApplyingStyle, setIsApplyingStyle] = useState(false);
  const [isStylePreview, setIsStylePreview] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusType, setStatusType] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [statusText, setStatusText] = useState("");

  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState(
    "Initializing browser context",
  );
  const [elapsedTime, setElapsedTime] = useState("0.0s");
  const [resultVideo, setResultVideo] = useState<{
    jobId: string;
    sourceUrl: string;
    url: string;
    duration: string;
    scrollStrategy?: "document" | "virtual";
    isEdited?: boolean;
  } | null>(null);

  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const progressStartTimeRef = useRef(0);

  const handleDevicePresetChange = (preset: string) => {
    setDevicePreset(preset);
    const [w, h] = preset.split("x").map(Number);
    setWidth(w);
    setHeight(h);
  };

  function startProgressSimulator(tier: RenderTier) {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    setProgressPercent(0);
    progressStartTimeRef.current = Date.now();
    const { expectedDurationMs } = TIER_CONFIG[tier];

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - progressStartTimeRef.current;
      setElapsedTime(`${(elapsed / 1000).toFixed(1)}s`);

      const pct = 95 * (1 - Math.exp(-elapsed / (expectedDurationMs * 0.45)));
      setProgressPercent(Math.round(pct));

      if (tier === "draft") {
        if (elapsed < 1200) {
          setProgressStatus("Launching headless browser context...");
        } else if (elapsed < 3500) {
          setProgressStatus("Scrolling website & capturing viewport...");
        } else {
          setProgressStatus("Finalizing MP4 video stream...");
        }
      } else if (tier === "standard") {
        if (elapsed < 2000) {
          setProgressStatus("Spawning Chromium browser instance...");
        } else if (elapsed < 5000) {
          setProgressStatus("Hydrating lazy-loaded assets & selectors...");
        } else if (elapsed < 14000) {
          setProgressStatus("Capturing frames & encoding video...");
        } else {
          setProgressStatus("Stitching MP4 with FFmpeg...");
        }
      } else {
        if (elapsed < 3000) {
          setProgressStatus("Spawning Chromium & priming assets...");
        } else if (elapsed < 8000) {
          setProgressStatus("Hydrating lazy-loaded content...");
        } else if (elapsed < 30000) {
          setProgressStatus("Capturing high-res frames at 2px/frame...");
        } else {
          setProgressStatus("Stitching cinematic MP4 with FFmpeg...");
        }
      }
    }, 100);
  }

  function stopProgressSimulator(success: boolean, errorMsg = "") {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    if (success) {
      setProgressPercent(100);
      setProgressStatus("Capture completed!");
      setTimeout(() => {
        setProgressPercent(0);
      }, 1000);
    } else {
      setProgressStatus(errorMsg || "Capture failed.");
    }
  }

  const openEditor = () => {
    if (!resultVideo) return;

    const session: EditorSession = {
      jobId: resultVideo.jobId,
      sourceUrl: resultVideo.sourceUrl,
      targetUrl: url.trim(),
      width,
      height,
      scrollStrategy: resultVideo.scrollStrategy,
    };
    saveEditorSession(session);
    setEditorSession(session);
    navigate("/editor");
  };

  const applyStyleToRecording = async () => {
    if (!resultVideo) return;

    setIsApplyingStyle(true);
    setStatusType("idle");
    try {
      const res = await fetch("/style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: resultVideo.jobId,
          backgroundPreset,
          addShadow,
          roundedCorners,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not apply style");
      }

      const styledUrl = `${data.videoUrl}?t=${Date.now()}`;
      setResultVideo((current) =>
        current ? { ...current, url: styledUrl } : current,
      );
      setIsStylePreview(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not apply style";
      setStatusType("error");
      setStatusText(message);
      setIsStylePreview(false);
    } finally {
      setIsApplyingStyle(false);
    }
  };

  const updateCanvasStyle = (update: () => void) => {
    update();
    if (resultVideo) setIsStylePreview(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResultVideo(null);
    setIsStylePreview(false);
    setStatusType("loading");
    setStatusText(`Recording (${TIER_CONFIG[renderTier].label.toLowerCase()})`);
    setIsSubmitting(true);

    startProgressSimulator(renderTier);

    const tier = TIER_CONFIG[renderTier];
    const body = {
      targetUrl: url.trim(),
      exportFormat: "mp4",
      videoConfig: {
        framerate: tier.framerate,
        qualityPreset: tier.qualityPreset,
        viewport: { width, height, deviceScaleFactor: tier.deviceScaleFactor },
      },
      animationConfig: {
        fastMode: tier.fastMode,
        captureMode: tier.captureMode,
        pixelsPerFrame: pixelsPerFrame,
        heroHoldMs,
        preRecordingDelayMs: tier.preRecordingDelayMs,
        scrollCurve:
          selectedCurve === "custom"
            ? { preset: "custom", bezier: customBezier }
            : { preset: selectedCurve },
        removeOverlayElements: true,
        scrollMode,
        ...(scrollMode !== "document"
          ? {
              virtualScrollCycles,
            }
          : {}),
      },
      backgroundPreset,
      addShadow,
      roundedCorners,
    };

    try {
      const res = await fetch("/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Recording failed");
      }

      setResultVideo({
        jobId: data.jobId,
        sourceUrl: data.sourceVideoUrl ?? data.videoUrl,
        url: data.videoUrl,
        duration: `${(data.durationMs / 1000).toFixed(1)}s`,
        scrollStrategy: data.scrollStrategy,
        isEdited: false,
      });
      setStatusType("success");
      setStatusText("Recording finished successfully.");
      stopProgressSimulator(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setStatusType("error");
      setStatusText(message);
      stopProgressSimulator(false, message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasEditorSession = !!editorSession || !!resultVideo;



  return (
    <main className="app-shell">
      <AppTopbar
        currentPath={currentPath}
        onNavigate={navigate}
        isRecording={isSubmitting}
        hasEditorSession={hasEditorSession}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="app-content">
        {currentPath === "/upcoming" ? (
          <UpcomingFeatures />
        ) : (
          <form id="form" className="recorder-page" onSubmit={handleSubmit}>
            <div className="recorder-sidebar-panel">
              <div className="sidebar-section-card">
                <h3 className="sidebar-section-title">Setup</h3>
                <TargetPageForm
                  url={url}
                  setUrl={setUrl}
                  devicePreset={devicePreset}
                  setDevicePreset={handleDevicePresetChange}
                />
              </div>

              <div className="sidebar-section-card">
                <details className="recorder-disclosure">
                  <summary>
                    <span className="recorder-disclosure-icon"><SlidersHorizontal size={16} /></span>
                    <span>Motion</span>
                    <small>
                      {selectedCurve.replaceAll("-", " ")} · hero {heroHoldMs === 0 ? "off" : `${heroHoldMs / 1000}s`}
                    </small>
                    <ChevronDown className="recorder-disclosure-chevron" size={16} />
                  </summary>
                  <div className="recorder-disclosure-content">
                    <ScrollPhysicsForm
                      selectedCurve={selectedCurve}
                      setSelectedCurve={setSelectedCurve}
                      customBezier={customBezier}
                      setCustomBezier={setCustomBezier}
                      customInputText={customInputText}
                      setCustomInputText={setCustomInputText}
                      pixelsPerFrame={pixelsPerFrame}
                      setPixelsPerFrame={setPixelsPerFrame}
                      heroHoldMs={heroHoldMs}
                      setHeroHoldMs={setHeroHoldMs}
                    />

                    <VirtualScrollForm
                      scrollMode={scrollMode}
                      setScrollMode={setScrollMode}
                      virtualScrollCycles={virtualScrollCycles}
                      setVirtualScrollCycles={setVirtualScrollCycles}
                      useFixedDuration={useFixedDuration}
                      setUseFixedDuration={setUseFixedDuration}
                      virtualScrollDurationMs={virtualScrollDurationMs}
                      setVirtualScrollDurationMs={setVirtualScrollDurationMs}
                      fastMode={renderTier === "draft"}
                    />
                  </div>
                </details>
              </div>

              <div className="sidebar-section-card">
                <BackgroundCanvasForm
                  backgroundPreset={backgroundPreset}
                  setBackgroundPreset={(preset) =>
                    updateCanvasStyle(() => setBackgroundPreset(preset))
                  }
                  addShadow={addShadow}
                  setAddShadow={(enabled) =>
                    updateCanvasStyle(() => setAddShadow(enabled))
                  }
                  roundedCorners={roundedCorners}
                  setRoundedCorners={(enabled) =>
                    updateCanvasStyle(() => setRoundedCorners(enabled))
                  }
                  onApplyStyle={resultVideo ? applyStyleToRecording : undefined}
                  isApplyingStyle={isApplyingStyle}
                />
              </div>
            </div>

            <div className="recorder-main-panel">
              {/* Top Controls Bento Card */}
              <div className="sidebar-section-card recorder-controls-card">
                <div className="controls-card-left">
                  {/* Render quality tier selector */}
                  <div
                    className="render-tier-group"
                    role="radiogroup"
                    aria-label="Render quality"
                  >
                    {(Object.entries(TIER_CONFIG) as [RenderTier, typeof TIER_CONFIG[RenderTier]][])
                      .filter(([tier]) => tier !== "draft")
                      .map(([tier, cfg]) => {
                        const TierIcon = tier === "cinematic" ? Sparkles : Clapperboard;
                        return (
                          <button
                          key={tier}
                          type="button"
                          id={`renderTier-${tier}`}
                          role="radio"
                          aria-checked={renderTier === tier}
                          className={`render-tier-btn render-tier-btn--${tier}${renderTier === tier ? " is-active" : ""}`}
                          title={cfg.hint}
                           onClick={() => {
                             setRenderTier(tier);
                             setVirtualScrollCycles(cfg.defaultCycles);
                             setPixelsPerFrame(cfg.pixelsPerFrame);
                           }}
                        >
                          <span className="render-tier-icon"><TierIcon size={16} strokeWidth={1.8} /></span>
                          <span className="render-tier-name">{cfg.label}</span>
                          <span className="render-tier-hint">{cfg.hint}</span>
                        </button>
                        );
                      }
                    )}
                    <button
                      type="submit"
                      id="submit"
                      className="recorder-capture-btn-sm product-btn-primary"
                      disabled={isSubmitting || !url.trim()}
                      style={{ flex: 1, minWidth: 0, alignSelf: "stretch", borderRadius: "var(--ui-radius)", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      {isSubmitting && <span className="loader-circle" />}
                      {!isSubmitting && <Play size={16} fill="currentColor" aria-hidden="true" />}
                      <span id="buttonText">
                        {isSubmitting
                          ? "Recording…"
                          : resultVideo
                            ? "Record again"
                            : "Start capture"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress & Error indicators if any */}
              {(isSubmitting || statusType === "error") && (
                <div className="sidebar-section-card status-indicator-card">
                  {isSubmitting && (
                    <ProgressCard
                      percent={progressPercent}
                      status={progressStatus}
                      elapsed={elapsedTime}
                    />
                  )}
                  {statusType === "error" && (
                    <p className="status error" id="status" aria-live="polite">
                      {statusText}
                    </p>
                  )}
                </div>
              )}

              {/* Bottom Video Playback Bento Card */}
              <div
                className={`recorder-preview-panel${width < height ? " is-portrait-stage" : ""}${(!resultVideo || isStylePreview) && backgroundPreset !== "none" ? " has-canvas-background" : ""}${(!resultVideo || isStylePreview) && addShadow ? " has-canvas-shadow" : ""}${(!resultVideo || isStylePreview) && roundedCorners ? " has-canvas-rounded" : ""}`}
                style={
                  (!resultVideo || isStylePreview) && backgroundPreset !== "none"
                    ? { backgroundImage: `url(/background_presets/${backgroundPreset}.png)` }
                    : undefined
                }
              >
                <section className="recorder-preview" aria-label="Preview">
                  <BrowserMockup
                    url={url}
                    videoUrl={(isStylePreview ? resultVideo?.sourceUrl : resultVideo?.url) || null}
                    downloadUrl={isStylePreview ? null : resultVideo?.url || null}
                    isRenderingStyle={isApplyingStyle}
                    duration={resultVideo?.duration || null}
                    scrollStrategy={resultVideo?.scrollStrategy}
                    width={width}
                    height={height}
                    isSubmitting={isSubmitting}
                  />
                </section>
              </div>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
