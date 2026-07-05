import React, { useState, useRef } from "react";
import Logo from "./components/Logo";
import TargetPageForm from "./components/TargetPageForm";
import ScrollPhysicsForm from "./components/ScrollPhysicsForm";
import BezierVisualizer from "./components/BezierVisualizer";
import ProgressCard from "./components/ProgressCard";
import BrowserMockup from "./components/BrowserMockup";

export default function App() {
  // Target Page Configurations
  const [url, setUrl] = useState("");
  const [devicePreset, setDevicePreset] = useState("1920x1080");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [quality, setQuality] = useState("high");
  const [fastMode, setFastMode] = useState(false);

  // Bezier States
  const [selectedCurve, setSelectedCurve] = useState("ease-in-out");
  const [customBezier, setCustomBezier] = useState<[number, number, number, number]>([0.42, 0, 0.58, 1]);
  const [customInputText, setCustomInputText] = useState("0.42, 0.00, 0.58, 1.00");

  // Status and Output States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusType, setStatusType] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusText, setStatusText] = useState("");
  
  // Progress Loader States
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Initializing browser context");
  const [elapsedTime, setElapsedTime] = useState("0.0s");
  const [resultVideo, setResultVideo] = useState<{ url: string; duration: string } | null>(null);

  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressStartTimeRef = useRef(0);

  // Sync dimensions helper when preset changes in child component
  const handleDevicePresetChange = (preset: string) => {
    setDevicePreset(preset);
    const [w, h] = preset.split("x").map(Number);
    setWidth(w);
    setHeight(h);
  };

  // Progress Bar Easing Loops
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
          setProgressStatus("Scrolling website & capturing responsive viewport...");
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

  // Submit Form Handler
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
        scrollCurve: selectedCurve === "custom" ? { preset: "custom", bezier: customBezier } : { preset: selectedCurve },
        removeOverlayElements: true,
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
        url: data.videoUrl,
        duration: `${(data.durationMs / 1000).toFixed(1)}s`,
      });
      setStatusType("success");
      setStatusText("Recording finished successfully.");
      stopProgressSimulator(true);
    } catch (err: any) {
      setStatusType("error");
      setStatusText(err.message || "Something went wrong");
      stopProgressSimulator(false, err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="app-container">
      <header>
        <Logo isRecording={isSubmitting} />
        <p className="subtitle">
          Record smooth scroll-through videos of any webpage as MP4.
        </p>
      </header>

      <form id="form" className="app-grid" onSubmit={handleSubmit}>
        {/* Left column: Settings panels */}
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

          <ScrollPhysicsForm
            selectedCurve={selectedCurve}
            setSelectedCurve={setSelectedCurve}
            customBezier={customBezier}
            setCustomBezier={setCustomBezier}
            customInputText={customInputText}
            setCustomInputText={setCustomInputText}
            fastMode={fastMode}
            setFastMode={setFastMode}
          />
        </div>

        {/* Right column: Interactive preview & Action feedback */}
        <div className="grid-right">
          <div className="panel sticky-panel">
            <div className="panel-title">Motion Profile</div>

            <BezierVisualizer
              selectedCurve={selectedCurve}
              setSelectedCurve={setSelectedCurve}
              customBezier={customBezier}
              setCustomBezier={setCustomBezier}
              customInputText={customInputText}
              setCustomInputText={setCustomInputText}
            />

            <div className="actions-area">
              <button type="submit" id="submit" disabled={isSubmitting}>
                <span className="loader-circle"></span>
                <span id="buttonText">{isSubmitting ? "Recording..." : "Start Capture"}</span>
              </button>
            </div>

            {statusType !== "idle" && (
              <p className={`status ${statusType}`} id="status" aria-live="polite">
                {statusText}
              </p>
            )}

            <ProgressCard
              percent={progressPercent}
              status={progressStatus}
              elapsed={elapsedTime}
            />

            {resultVideo && (
              <BrowserMockup
                url={url}
                videoUrl={resultVideo.url}
                duration={resultVideo.duration}
                width={width}
                height={height}
              />
            )}
          </div>
        </div>
      </form>
    </main>
  );
}
