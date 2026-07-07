import React, { useState, useRef, useEffect } from "react";
import AppTopbar from "./components/AppTopbar";
import { LORDICON } from "./lib/icons";
import LordIcon from "./components/LordIcon";
import TargetPageForm from "./components/TargetPageForm";
import ScrollPhysicsForm from "./components/ScrollPhysicsForm";
import VirtualScrollForm, {
  type ScrollModeOption,
} from "./components/VirtualScrollForm";

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
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [editorSession, setEditorSession] = useState<EditorSession | null>(
    () => (window.location.pathname === "/editor" ? loadEditorSession() : null),
  );

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
      setCurrentPath(window.location.pathname);
      if (window.location.pathname === "/editor") {
        setEditorSession(loadEditorSession());
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
    if (path === "/editor") {
      setEditorSession(loadEditorSession());
    }
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
      pixelsPerFrame: 16,
      preRecordingDelayMs: 2000,
      defaultCycles: 8,
      expectedDurationMs: 25000,
      label: "Standard",
      hint: "~25s · Frame-by-frame capture, balanced quality",
    },
    cinematic: {
      captureMode: "export",
      fastMode: false,
      qualityPreset: "high",
      pixelsPerFrame: 10,
      preRecordingDelayMs: 3000,
      defaultCycles: 10,
      expectedDurationMs: 55000,
      label: "Cinematic",
      hint: "~55s · High-quality, pixel-perfect output",
    },
  };

  const [selectedCurve, setSelectedCurve] = useState("ease-in-out");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResultVideo(null);
    setStatusType("loading");
    setStatusText(`Recording (${TIER_CONFIG[renderTier].label.toLowerCase()})`);
    setIsSubmitting(true);

    startProgressSimulator(renderTier);

    const tier = TIER_CONFIG[renderTier];
    const body = {
      targetUrl: url.trim(),
      exportFormat: "mp4",
      videoConfig: {
        framerate: 60,
        qualityPreset: tier.qualityPreset,
        viewport: { width, height },
      },
      animationConfig: {
        fastMode: tier.fastMode,
        captureMode: tier.captureMode,
        pixelsPerFrame: tier.pixelsPerFrame,
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
              ...(useFixedDuration ? { virtualScrollDurationMs } : {}),
            }
          : {}),
      },
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
        sourceUrl: data.videoUrl,
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

  if (currentPath === "/editor") {
    if (!editorSession) {
      return (
        <main className="app-shell">
          <AppTopbar
            currentPath="/editor"
            onNavigate={navigate}
            hasEditorSession={false}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          <div className="product-empty">
            <LordIcon src={LORDICON.editor} size={48} trigger="loop" />
            <h1>No capture loaded</h1>
            <p>Record a website first, then open it in the editor.</p>
            <button
              type="button"
              className="product-btn"
              onClick={() => navigate("/")}
            >
              Go to Recorder
            </button>
          </div>
        </main>
      );
    }

    return (
      <EditorPage
        jobId={editorSession.jobId}
        sourceVideoUrl={editorSession.sourceUrl}
        targetUrl={editorSession.targetUrl}
        width={editorSession.width}
        height={editorSession.height}
        scrollStrategy={editorSession.scrollStrategy}
        onNavigate={navigate}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

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
                <h3 className="sidebar-section-title">Scroll Settings</h3>
                {renderTier === "draft" ? (
                  <ScrollPhysicsForm
                    selectedCurve={selectedCurve}
                    setSelectedCurve={setSelectedCurve}
                    customBezier={customBezier}
                    setCustomBezier={setCustomBezier}
                    customInputText={customInputText}
                    setCustomInputText={setCustomInputText}
                  />
                ) : (
                  <div className="linear-info-box" style={{ padding: "12px", background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                    <p style={{ margin: 0, fontWeight: "500", color: "var(--text-primary)", marginBottom: "4px" }}>
                      Linear Capture (Eased Post-Record)
                    </p>
                    Scroll curves and speed are fully customizable and update in real-time inside the **Editor** once rendering completes.
                  </div>
                )}

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
                    {(Object.entries(TIER_CONFIG) as [RenderTier, typeof TIER_CONFIG[RenderTier]][]).map(
                      ([tier, cfg]) => (
                        <button
                          key={tier}
                          type="button"
                          id={`renderTier-${tier}`}
                          role="radio"
                          aria-checked={renderTier === tier}
                          className={`render-tier-btn render-tier-btn--${tier}${renderTier === tier ? " is-active" : ""}`}
                          onClick={() => {
                            setRenderTier(tier);
                            setVirtualScrollCycles(cfg.defaultCycles);
                          }}
                        >
                          <span className="render-tier-name">{cfg.label}</span>
                          <span className="render-tier-hint">{cfg.hint}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="controls-card-right">
                  <button
                    type="submit"
                    id="submit"
                    className="recorder-capture-btn-sm product-btn-primary"
                    disabled={isSubmitting || !url.trim()}
                  >
                    {isSubmitting && <span className="loader-circle" />}
                    <span id="buttonText">
                      {isSubmitting
                        ? "Recording…"
                        : resultVideo
                          ? "Record again"
                          : "Start capture"}
                    </span>
                  </button>

                  {resultVideo && !isSubmitting && (
                    <button
                      type="button"
                      className="recorder-editor-btn-sm product-btn"
                      onClick={openEditor}
                    >
                      Open in editor
                    </button>
                  )}
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
              <div className={`recorder-preview-panel${width < height ? " is-portrait-stage" : ""}`}>
                <section className="recorder-preview" aria-label="Preview">
                  <BrowserMockup
                    url={url}
                    videoUrl={resultVideo?.url || null}
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
