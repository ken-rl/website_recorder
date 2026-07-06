import React, { useState, useRef, useEffect } from "react";
import Logo from "./components/Logo";
import TargetPageForm from "./components/TargetPageForm";
import ScrollPhysicsForm from "./components/ScrollPhysicsForm";
import VirtualScrollForm, {
  type ScrollModeOption,
} from "./components/VirtualScrollForm";
import BezierVisualizer from "./components/BezierVisualizer";
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
  const [quality, setQuality] = useState("high");
  const [fastMode, setFastMode] = useState(false);

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

  function startProgressSimulator(isFast: boolean) {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    setProgressPercent(0);
    progressStartTimeRef.current = Date.now();
    const expectedDuration = isFast ? 5000 : 18000;

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - progressStartTimeRef.current;
      setElapsedTime(`${(elapsed / 1000).toFixed(1)}s`);

      const pct = 95 * (1 - Math.exp(-elapsed / (expectedDuration * 0.45)));
      setProgressPercent(Math.round(pct));

      if (isFast) {
        if (elapsed < 1200) {
          setProgressStatus("Launching headless browser context...");
        } else if (elapsed < 3500) {
          setProgressStatus(
            "Scrolling website & capturing responsive viewport...",
          );
        } else {
          setProgressStatus("Processing and finalizing MP4 video stream...");
        }
      } else {
        if (elapsed < 2000) {
          setProgressStatus("Spawning Chromium browser instance...");
        } else if (elapsed < 5000) {
          setProgressStatus("Hydrating lazy-loaded assets & selectors...");
        } else if (elapsed < 12000) {
          setProgressStatus("Scrolling website & encoding 60fps frames...");
        } else {
          setProgressStatus("Processing and stitching MP4 with FFmpeg...");
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
    setStatusText(fastMode ? "Recording (fast mode)" : "Recording website");
    setIsSubmitting(true);

    startProgressSimulator(fastMode);

    const body = {
      targetUrl: url.trim(),
      exportFormat: "mp4",
      videoConfig: {
        framerate: 60,
        qualityPreset: quality,
        viewport: { width, height },
      },
      animationConfig: {
        fastMode,
        pixelsPerFrame: fastMode ? 12 : 4,
        preRecordingDelayMs: fastMode ? 500 : 2000,
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

  if (currentPath === "/editor") {
    if (!editorSession) {
      return (
        <main className="editor-empty">
          <div className="editor-empty-card">
            <h1>No capture loaded</h1>
            <p>Record a website first, then open it in the editor.</p>
            <button type="button" onClick={() => navigate("/")}>
              Back to Recorder
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
        onBack={() => navigate("/")}
      />
    );
  }

  return (
    <main className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <Logo isRecording={isSubmitting} />
          <p className="subtitle">
            Record smooth scroll-through videos of any webpage as MP4.
          </p>
        </div>
        <nav className="header-nav">
          <button
            type="button"
            className={`nav-link ${currentPath === "/" || currentPath === "" ? "active" : ""}`}
            onClick={() => navigate("/")}
          >
            Recorder
          </button>
          <button
            type="button"
            className={`nav-link ${currentPath === "/upcoming" ? "active" : ""}`}
            onClick={() => navigate("/upcoming")}
          >
            Roadmap
          </button>
        </nav>
      </header>

      {currentPath === "/upcoming" ? (
        <UpcomingFeatures />
      ) : (
        <form id="form" className="app-grid" onSubmit={handleSubmit}>
          <div className="grid-left">
            <TargetPageForm
              url={url}
              setUrl={setUrl}
              devicePreset={devicePreset}
              setDevicePreset={handleDevicePresetChange}
              quality={quality}
              setQuality={setQuality}
              fastMode={fastMode}
            />

            <section className="panel">
              <div className="panel-title">Scroll Physics</div>

              <ScrollPhysicsForm
                selectedCurve={selectedCurve}
                setSelectedCurve={setSelectedCurve}
                customBezier={customBezier}
                setCustomBezier={setCustomBezier}
                customInputText={customInputText}
                setCustomInputText={setCustomInputText}
              />

              <div style={{ marginTop: "1.5rem" }}>
                <VirtualScrollForm
                  scrollMode={scrollMode}
                  setScrollMode={setScrollMode}
                  virtualScrollCycles={virtualScrollCycles}
                  setVirtualScrollCycles={setVirtualScrollCycles}
                  useFixedDuration={useFixedDuration}
                  setUseFixedDuration={setUseFixedDuration}
                  virtualScrollDurationMs={virtualScrollDurationMs}
                  setVirtualScrollDurationMs={setVirtualScrollDurationMs}
                  fastMode={fastMode}
                />
              </div>

              <div style={{ marginTop: "1.5rem" }}>
                <BezierVisualizer
                  selectedCurve={selectedCurve}
                  setSelectedCurve={setSelectedCurve}
                  customBezier={customBezier}
                  setCustomBezier={setCustomBezier}
                  customInputText={customInputText}
                  setCustomInputText={setCustomInputText}
                />
              </div>
            </section>
          </div>

          <div className="grid-right">
            <div className="panel sticky-panel">
              <div className="panel-title">Capture & Live Output</div>

              <div className="actions-area">
                <button type="submit" id="submit" disabled={isSubmitting}>
                  <span className="loader-circle"></span>
                  <span id="buttonText">
                    {isSubmitting ? "Recording..." : "Start Capture"}
                  </span>
                </button>
              </div>

              <div className="field" style={{ marginTop: "1.25rem" }}>
                <div className="toggle-row">
                  <div className="toggle-copy">
                    <strong>Fast Hydration Mode</strong>
                    <span>
                      Skips heavy page hydration delays and speeds up scrolling
                      dynamics.
                    </span>
                  </div>
                  <label className="toggle" aria-label="Fast mode">
                    <input
                      type="checkbox"
                      id="fastMode"
                      checked={fastMode}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setFastMode(enabled);
                        setVirtualScrollCycles((cycles) =>
                          cycles === (enabled ? 8 : 6)
                            ? enabled
                              ? 6
                              : 8
                            : cycles,
                        );
                      }}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              {statusType === "error" && (
                <p className="status error" id="status" aria-live="polite">
                  {statusText}
                </p>
              )}

              <ProgressCard
                percent={progressPercent}
                status={progressStatus}
                elapsed={elapsedTime}
              />

              <BrowserMockup
                url={url}
                videoUrl={resultVideo?.url || null}
                duration={resultVideo?.duration || null}
                scrollStrategy={resultVideo?.scrollStrategy}
                isEdited={resultVideo?.isEdited}
                width={width}
                height={height}
                isSubmitting={isSubmitting}
                statusType={statusType}
                onOpenEditor={resultVideo ? openEditor : undefined}
              />
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
