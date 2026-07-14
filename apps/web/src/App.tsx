import React, { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  Clapperboard,
  Play,
  Settings2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import AppSidebar from "./components/AppSidebar";
import { LORDICON } from "./lib/icons";
import LordIcon from "./components/LordIcon";
import { CaptureTargetFields, deviceLabel } from "./components/TargetPageForm";
import ScrollPhysicsForm from "./components/ScrollPhysicsForm";
import VirtualScrollForm, {
  type ScrollModeOption,
} from "./components/VirtualScrollForm";
import PauseTriggersForm, {
  toPauseTriggersPayload,
  type PauseTriggerDraft,
} from "./components/PauseTriggersForm";
import BackgroundCanvasForm, {
  type BackgroundPreset,
} from "./components/BackgroundCanvasForm";

import BrowserMockup from "./components/BrowserMockup";

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    const path = window.location.pathname;
    if (path === "/upcoming") return "/";
    return path;
  });

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  const [navCollapsed, setNavCollapsed] = useState(() => {
    return localStorage.getItem("nav-collapsed") === "1";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("nav-collapsed", navCollapsed ? "1" : "0");
    document.documentElement.dataset.nav = navCollapsed ? "collapsed" : "expanded";
  }, [navCollapsed]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  useEffect(() => {
    const handlePopState = () => {
      let path = window.location.pathname;
      if (path === "/upcoming") {
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
    if (path === "/upcoming") {
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

  const [scrollMode, setScrollMode] = useState<ScrollModeOption>("auto");
  const [virtualScrollCycles, setVirtualScrollCycles] = useState(8);
  const [useFixedDuration, setUseFixedDuration] = useState(false);
  const [virtualScrollDurationMs, setVirtualScrollDurationMs] = useState(30000);
  const [pixelsPerFrame, setPixelsPerFrame] = useState(16);
  const [heroHoldMs, setHeroHoldMs] = useState(1500);
  const [pauseTriggers, setPauseTriggers] = useState<PauseTriggerDraft[]>([]);
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
    width: number;
    height: number;
    qualityLabel: string;
    scrollStrategy?: "document" | "virtual";
    isEdited?: boolean;
  } | null>(null);
  /** After a capture, setup controls stay locked until the user chooses to edit for a re-record. */
  const [settingsUnlocked, setSettingsUnlocked] = useState(true);

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
    const captureWidth = width;
    const captureHeight = height;
    const captureQuality = TIER_CONFIG[renderTier].label;

    setResultVideo(null);
    setIsStylePreview(false);
    setSettingsUnlocked(true);
    setStatusType("loading");
    setStatusText(`Recording (${captureQuality.toLowerCase()})`);
    setIsSubmitting(true);

    startProgressSimulator(renderTier);

    const tier = TIER_CONFIG[renderTier];
    const body = {
      targetUrl: url.trim(),
      exportFormat: "mp4",
      videoConfig: {
        framerate: tier.framerate,
        qualityPreset: tier.qualityPreset,
        viewport: {
          width: captureWidth,
          height: captureHeight,
          deviceScaleFactor: tier.deviceScaleFactor,
        },
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
        pauseTriggers: toPauseTriggersPayload(pauseTriggers),
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
        width: captureWidth,
        height: captureHeight,
        qualityLabel: captureQuality,
        scrollStrategy: data.scrollStrategy,
        isEdited: false,
      });
      setSettingsUnlocked(false);
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

  const hasRecording = Boolean(resultVideo);
  const captureLocked = hasRecording && !settingsUnlocked && !isSubmitting;
  /** Keep the finished video's aspect ratio stable even if setup is unlocked for a re-record. */
  const previewWidth = resultVideo?.width ?? width;
  const previewHeight = resultVideo?.height ?? height;
  const activePauseTriggers = toPauseTriggersPayload(pauseTriggers);



  return (
    <main className={`app-shell${navCollapsed ? " is-nav-collapsed" : ""}`}>
      <AppSidebar
        currentPath={currentPath}
        onNavigate={navigate}
        isRecording={isSubmitting}
        theme={theme}
        onToggleTheme={toggleTheme}
        collapsed={navCollapsed}
        onToggleCollapsed={() => setNavCollapsed((c) => !c)}
      />

      <div className="app-content">
          <form
            id="form"
            className={`recorder-page${hasRecording ? " has-recording" : ""}${captureLocked ? " is-capture-locked" : ""}`}
            onSubmit={handleSubmit}
          >
            <div className="recorder-sidebar-panel">
              {hasRecording && (
                <div className="sidebar-section-card recorder-style-card">
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
                    onApplyStyle={applyStyleToRecording}
                    isApplyingStyle={isApplyingStyle}
                  />
                </div>
              )}

              {captureLocked ? (
                <div className="sidebar-section-card is-locked-section">
                  <div className="sidebar-section-heading">
                    <h3 className="sidebar-section-title">This capture</h3>
                    <button
                      type="button"
                      className="recorder-unlock-settings"
                      onClick={() => setSettingsUnlocked(true)}
                    >
                      <Settings2 size={13} strokeWidth={2} aria-hidden />
                      Edit motion
                    </button>
                  </div>
                  <div className="recorder-capture-summary" role="status">
                    <div className="recorder-capture-summary-row">
                      <span className="recorder-capture-summary-label">Motion</span>
                      <span className="recorder-capture-summary-value">
                        {selectedCurve.replaceAll("-", " ")}
                        {heroHoldMs === 0 ? "" : ` · hero ${heroHoldMs / 1000}s`}
                      </span>
                    </div>
                    <div className="recorder-capture-summary-row">
                      <span className="recorder-capture-summary-label">Quality</span>
                      <span className="recorder-capture-summary-value">
                        {resultVideo?.qualityLabel ?? TIER_CONFIG[renderTier].label}
                        {resultVideo?.duration ? ` · ${resultVideo.duration}` : ""}
                      </span>
                    </div>
                    <div className="recorder-capture-summary-row">
                      <span className="recorder-capture-summary-label">Viewport</span>
                      <span className="recorder-capture-summary-value">
                        {deviceLabel(devicePreset)} · {previewWidth}×{previewHeight}
                      </span>
                    </div>
                    <div className="recorder-capture-summary-row">
                      <span className="recorder-capture-summary-label">Pauses</span>
                      <span className="recorder-capture-summary-value">
                        {activePauseTriggers.length === 0
                          ? "None"
                          : `${activePauseTriggers.length} trigger${activePauseTriggers.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    <p className="recorder-capture-summary-note">
                      Motion and screen size are locked to this video. Change the URL
                      anytime; re-record to apply new capture settings.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="sidebar-section-card">
                  {hasRecording && (
                    <div className="sidebar-section-heading">
                      <h3 className="sidebar-section-title">Next capture</h3>
                      <button
                        type="button"
                        className="recorder-unlock-settings is-active"
                        onClick={() => setSettingsUnlocked(false)}
                      >
                        Done
                      </button>
                    </div>
                  )}
                  <details className="recorder-disclosure" open={!hasRecording ? undefined : true}>
                    <summary>
                      <span className="recorder-disclosure-icon">
                        <SlidersHorizontal size={16} />
                      </span>
                      <span>Motion</span>
                      <small>
                        {selectedCurve.replaceAll("-", " ")}
                        {activePauseTriggers.length > 0
                          ? ` · ${activePauseTriggers.length} pause${activePauseTriggers.length === 1 ? "" : "s"}`
                          : ""}
                      </small>
                      <ChevronDown className="recorder-disclosure-chevron" size={16} />
                    </summary>
                    <div className="recorder-disclosure-content">
                      <ScrollPhysicsForm
                        selectedCurve={selectedCurve}
                        setSelectedCurve={setSelectedCurve}
                        customBezier={customBezier}
                        setCustomBezier={setCustomBezier}
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

                      <PauseTriggersForm
                        triggers={pauseTriggers}
                        setTriggers={setPauseTriggers}
                        disabled={isSubmitting}
                      />
                    </div>
                  </details>
                </div>
              )}

              {!hasRecording && (
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
                    onApplyStyle={undefined}
                    isApplyingStyle={isApplyingStyle}
                  />
                </div>
              )}
            </div>

            <div className="recorder-main-panel">
              <div className="recorder-controls-card">
                <div className="recorder-capture-bar">
                  <CaptureTargetFields
                    url={url}
                    setUrl={setUrl}
                    devicePreset={devicePreset}
                    setDevicePreset={handleDevicePresetChange}
                    sizeLocked={captureLocked}
                    disabled={isSubmitting}
                  />

                  <div className="recorder-capture-bar-row">
                    {captureLocked ? (
                      <div className="recorder-capture-ready" role="status">
                        <span className="recorder-capture-ready-dot" aria-hidden />
                        <div className="recorder-capture-ready-text">
                          <strong>Recording ready</strong>
                          <span>
                            {resultVideo?.qualityLabel}
                            {resultVideo?.duration ? ` · ${resultVideo.duration}` : ""}
                            {" · "}
                            {deviceLabel(devicePreset)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="recorder-capture-quality">
                        <span
                          className="recorder-capture-label"
                          id="render-quality-label"
                        >
                          Quality
                        </span>
                        <div
                          className="render-tier-group"
                          role="radiogroup"
                          aria-labelledby="render-quality-label"
                        >
                          {(
                            Object.entries(TIER_CONFIG) as [
                              RenderTier,
                              (typeof TIER_CONFIG)[RenderTier],
                            ][]
                          )
                            .filter(([tier]) => tier !== "draft")
                            .map(([tier, cfg]) => {
                              const TierIcon =
                                tier === "cinematic" ? Sparkles : Clapperboard;
                              return (
                                <button
                                  key={tier}
                                  type="button"
                                  id={`renderTier-${tier}`}
                                  role="radio"
                                  aria-checked={renderTier === tier}
                                  className={`render-tier-btn render-tier-btn--${tier}${renderTier === tier ? " is-active" : ""}`}
                                  title={cfg.hint}
                                  disabled={isSubmitting}
                                  onClick={() => {
                                    setRenderTier(tier);
                                    setVirtualScrollCycles(cfg.defaultCycles);
                                    setPixelsPerFrame(cfg.pixelsPerFrame);
                                  }}
                                >
                                  <span
                                    className="render-tier-icon"
                                    aria-hidden="true"
                                  >
                                    <TierIcon size={14} strokeWidth={2} />
                                  </span>
                                  <span className="render-tier-name">
                                    {cfg.label}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    <div className="recorder-capture-actions">
                      {captureLocked && (
                        <button
                          type="button"
                          className="recorder-capture-secondary"
                          onClick={() => setSettingsUnlocked(true)}
                        >
                          <Settings2 size={14} strokeWidth={2} aria-hidden />
                          Edit settings
                        </button>
                      )}
                      <button
                        type="submit"
                        id="submit"
                        className="recorder-capture-btn product-btn-primary"
                        disabled={isSubmitting || !url.trim()}
                      >
                        {isSubmitting && <span className="loader-circle" />}
                        {!isSubmitting && (
                          <Play size={15} fill="currentColor" aria-hidden="true" />
                        )}
                        <span id="buttonText">
                          {isSubmitting
                            ? "Recording…"
                            : hasRecording
                              ? "Record again"
                              : "Start capture"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
                {hasRecording && settingsUnlocked && !isSubmitting && (
                  <p className="recorder-rerecord-hint">
                    Settings unlocked for the next capture. The current video stays until
                    you record again.
                  </p>
                )}
              </div>

              {statusType === "error" && (
                <div className="sidebar-section-card status-indicator-card">
                  <p className="status error" id="status" aria-live="polite">
                    {statusText}
                  </p>
                </div>
              )}

              <div
                className={`recorder-preview-panel${previewWidth < previewHeight ? " is-portrait-stage" : ""}${(!resultVideo || isStylePreview) && backgroundPreset !== "none" ? " has-canvas-background" : ""}${(!resultVideo || isStylePreview) && addShadow ? " has-canvas-shadow" : ""}${(!resultVideo || isStylePreview) && roundedCorners ? " has-canvas-rounded" : ""}`}
                style={
                  (!resultVideo || isStylePreview) && backgroundPreset !== "none"
                    ? {
                        backgroundImage: `url(/background_presets/${backgroundPreset}.png)`,
                      }
                    : undefined
                }
              >
                <section className="recorder-preview" aria-label="Preview">
                  <BrowserMockup
                    url={url}
                    videoUrl={
                      (isStylePreview ? resultVideo?.sourceUrl : resultVideo?.url) ||
                      null
                    }
                    downloadUrl={isStylePreview ? null : resultVideo?.url || null}
                    isRenderingStyle={isApplyingStyle}
                    duration={resultVideo?.duration || null}
                    scrollStrategy={resultVideo?.scrollStrategy}
                    width={previewWidth}
                    height={previewHeight}
                    isSubmitting={isSubmitting}
                    recordingElapsed={isSubmitting ? elapsedTime : undefined}
                    recordingPercent={isSubmitting ? progressPercent : 0}
                    recordingStatus={isSubmitting ? progressStatus : undefined}
                  />
                </section>
              </div>
            </div>
          </form>
      </div>
    </main>
  );
}
