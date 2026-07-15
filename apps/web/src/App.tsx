import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clapperboard,
  Compass,
  Play,
  RefreshCcw,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import AppSidebar from "./components/AppSidebar";
import BackgroundCanvasForm, { type BackgroundPreset } from "./components/BackgroundCanvasForm";
import BrowserMockup from "./components/BrowserMockup";
import RecordingLibrary from "./components/RecordingLibrary";
import StoryboardDirector from "./components/StoryboardDirector";
import { CaptureTargetFields } from "./components/TargetPageForm";
import type {
  DirectorBeat,
  RecordingJob,
  RecordingRequest,
  WebsiteInspection,
} from "./lib/productTypes";

type RenderTier = "draft" | "standard" | "cinematic";

const TIER_CONFIG = {
  draft: { label: "Draft", framerate: 30, qualityPreset: "medium", deviceScaleFactor: 1, fastMode: true, captureMode: "preview", preRecordingDelayMs: 500, pixelsPerFrame: 12 },
  standard: { label: "Standard", framerate: 60, qualityPreset: "medium", deviceScaleFactor: 1, fastMode: false, captureMode: "export", preRecordingDelayMs: 2_000, pixelsPerFrame: 16 },
  cinematic: { label: "Cinematic", framerate: 60, qualityPreset: "high", deviceScaleFactor: 2, fastMode: false, captureMode: "export", preRecordingDelayMs: 3_000, pixelsPerFrame: 10 },
} as const;

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname === "/library" ? "/library" : "/");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" ? saved : "dark";
  });
  const [navCollapsed, setNavCollapsed] = useState(localStorage.getItem("nav-collapsed") === "1");
  const [url, setUrl] = useState("");
  const [devicePreset, setDevicePreset] = useState("1920x1080");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [renderTier, setRenderTier] = useState<RenderTier>("draft");
  const [scrollMode, setScrollMode] = useState<"auto" | "document" | "virtual">("auto");
  const [virtualCycles, setVirtualCycles] = useState(8);
  const [useFixedDuration, setUseFixedDuration] = useState(false);
  const [virtualDurationMs, setVirtualDurationMs] = useState(30_000);
  const [heroHoldMs, setHeroHoldMs] = useState(1_500);
  const [inspection, setInspection] = useState<WebsiteInspection | null>(null);
  const [beats, setBeats] = useState<DirectorBeat[]>([]);
  const [isInspecting, setIsInspecting] = useState(false);
  const [activeJob, setActiveJob] = useState<RecordingJob | null>(null);
  const [elapsed, setElapsed] = useState("0.0s");
  const [error, setError] = useState("");
  const [backgroundPreset, setBackgroundPreset] = useState<BackgroundPreset>("none");
  const [addShadow, setAddShadow] = useState(true);
  const [roundedCorners, setRoundedCorners] = useState(true);
  const [isApplyingStyle, setIsApplyingStyle] = useState(false);
  const [duplicatedRequest, setDuplicatedRequest] = useState<RecordingRequest | null>(null);
  const activeJobId = activeJob?.jobId;
  const activeJobStatus = activeJob?.status;
  const activeJobCreatedAt = activeJob?.createdAt;

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.nav = navCollapsed ? "collapsed" : "expanded";
    localStorage.setItem("nav-collapsed", navCollapsed ? "1" : "0");
  }, [navCollapsed]);

  useEffect(() => {
    const pop = () => setCurrentPath(window.location.pathname === "/library" ? "/library" : "/");
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    const jobId = localStorage.getItem("active-job-id");
    if (!jobId) return;
    void fetch(`/api/jobs/${jobId}`)
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) return;
        setActiveJob(data.job);
        if (!["queued", "running"].includes(data.job.status)) localStorage.removeItem("active-job-id");
      })
      .catch(() => localStorage.removeItem("active-job-id"));
  }, []);

  useEffect(() => {
    if (!activeJobId || !activeJobStatus || !["queued", "running"].includes(activeJobStatus)) return;
    localStorage.setItem("active-job-id", activeJobId);
    const events = new EventSource(`/api/jobs/${activeJobId}/events`);
    events.addEventListener("job", (event) => {
      const job = JSON.parse((event as MessageEvent).data) as RecordingJob;
      setActiveJob(job);
      if (!["queued", "running"].includes(job.status)) {
        localStorage.removeItem("active-job-id");
        events.close();
      }
    });
    return () => events.close();
  }, [activeJobId, activeJobStatus]);

  useEffect(() => {
    if (!activeJobId || !activeJobStatus || !activeJobCreatedAt || !["queued", "running"].includes(activeJobStatus)) return;
    const started = new Date(activeJobCreatedAt).getTime();
    const timer = window.setInterval(() => setElapsed(`${((Date.now() - started) / 1000).toFixed(1)}s`), 100);
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJobStatus, activeJobCreatedAt]);

  const isBusy = Boolean(activeJob && ["queued", "running"].includes(activeJob.status));
  const result = activeJob?.result;
  const previewWidth = result?.viewport.width || width;
  const previewHeight = result?.viewport.height || height;

  const updateUrl = (next: string) => {
    setUrl(next);
    setDuplicatedRequest(null);
    if (activeJob?.result && next.trim() !== activeJob.targetUrl) setActiveJob(null);
    if (inspection && next.trim() !== inspection.url) {
      setInspection(null);
      setBeats([]);
    }
  };

  const changeDevice = (preset: string) => {
    setDuplicatedRequest(null);
    setDevicePreset(preset);
    const [nextWidth, nextHeight] = preset.split("x").map(Number);
    setWidth(nextWidth);
    setHeight(nextHeight);
    setInspection(null);
    setBeats([]);
  };

  const analyze = async () => {
    setDuplicatedRequest(null);
    setIsInspecting(true);
    setError("");
    try {
      const response = await fetch("/api/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUrl: url.trim(), viewport: { width, height } }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not analyze page");
      const next = data.inspection as WebsiteInspection;
      setActiveJob(null);
      setInspection(next);
      setScrollMode(next.scrollMode);
      setBeats(defaultBeats(next));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not analyze page");
    } finally {
      setIsInspecting(false);
    }
  };

  const request = useMemo(() => buildRequest({
    url,
    width,
    height,
    renderTier,
    inspection,
    beats,
    scrollMode,
    virtualCycles,
    useFixedDuration,
    virtualDurationMs,
    heroHoldMs,
    backgroundPreset,
    addShadow,
    roundedCorners,
  }), [url, width, height, renderTier, inspection, beats, scrollMode, virtualCycles, useFixedDuration, virtualDurationMs, heroHoldMs, backgroundPreset, addShadow, roundedCorners]);

  const startCapture = async (quick = false) => {
    if (!url.trim()) return;
    setError("");
    try {
      const body = quick ? duplicatedRequest ?? buildRequest({ url, width, height, renderTier, inspection: null, beats: [], scrollMode, virtualCycles, useFixedDuration, virtualDurationMs, heroHoldMs, backgroundPreset, addShadow, roundedCorners }) : request;
      const response = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not queue capture");
      localStorage.setItem("active-job-id", data.jobId);
      const jobResponse = await fetch(data.statusUrl);
      const jobData = await jobResponse.json();
      setActiveJob(jobData.job);
      setDuplicatedRequest(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue capture");
    }
  };

  const cancel = async () => {
    if (!activeJob) return;
    const response = await fetch(`/api/jobs/${activeJob.jobId}/cancel`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Could not cancel capture");
  };

  const applyStyle = async () => {
    if (!activeJob?.result) return;
    setIsApplyingStyle(true);
    setError("");
    try {
      const response = await fetch("/style", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: activeJob.jobId, backgroundPreset, addShadow, roundedCorners }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not apply style");
      const fresh = await fetch(`/api/jobs/${activeJob.jobId}`).then((result) => result.json());
      setActiveJob({ ...fresh.job, result: { ...fresh.job.result, videoUrl: `${fresh.job.result.videoUrl}?t=${Date.now()}` } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not apply style");
    } finally {
      setIsApplyingStyle(false);
    }
  };

  const openJob = (job: RecordingJob) => {
    setActiveJob(job);
    setInspection(null);
    setBeats([]);
    setDuplicatedRequest(null);
    setUrl(job.targetUrl);
    if (job.result) {
      setWidth(job.result.viewport.width);
      setHeight(job.result.viewport.height);
      const preset = `${job.result.viewport.width}x${job.result.viewport.height}`;
      setDevicePreset(["1920x1080", "1440x900", "768x1024", "390x844"].includes(preset) ? preset : "1920x1080");
    }
    navigate("/");
  };

  const duplicateJob = (job: RecordingJob) => {
    if (!job.request) return;
    const viewport = job.request.videoConfig.viewport;
    setUrl(job.request.targetUrl);
    setWidth(viewport.width);
    setHeight(viewport.height);
    const preset = `${viewport.width}x${viewport.height}`;
    setDevicePreset(["1920x1080", "1440x900", "768x1024", "390x844"].includes(preset) ? preset : "1920x1080");
    setActiveJob(null);
    setInspection(null);
    setBeats([]);
    setDuplicatedRequest(job.request);
    const animation = job.request.animationConfig;
    setRenderTier(animation.fastMode === true ? "draft" : viewport.deviceScaleFactor === 2 ? "cinematic" : "standard");
    if (["none", "gray_noise_gradient", "paper_blue", "red_blocks_gradient"].includes(job.request.backgroundPreset || "none")) {
      setBackgroundPreset((job.request.backgroundPreset || "none") as BackgroundPreset);
    }
    setAddShadow(job.request.addShadow ?? true);
    setRoundedCorners(job.request.roundedCorners ?? true);
    navigate("/");
  };

  return (
    <main className={`app-shell workflow-shell${navCollapsed ? " is-nav-collapsed" : ""}`}>
      <AppSidebar currentPath={currentPath} onNavigate={navigate} isRecording={isBusy} theme={theme} onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")} collapsed={navCollapsed} onToggleCollapsed={() => setNavCollapsed(!navCollapsed)} />
      <div className="app-content workflow-content">
        {currentPath === "/library" ? (
          <RecordingLibrary onOpen={openJob} onDuplicate={duplicateJob} />
        ) : (
          <div className="studio-page">
            <header className="studio-masthead">
              <div><span className="eyebrow">Website cinematography</span><h1>Direct the scroll.</h1><p>Analyze the page, choose the moments, then render one deliberate take.</p></div>
              {inspection && <button type="button" className="quiet-button" onClick={() => { setInspection(null); setBeats([]); setActiveJob(null); }}><RefreshCcw size={14} /> New analysis</button>}
            </header>

            <section className="capture-command-bar">
              <CaptureTargetFields url={url} setUrl={updateUrl} devicePreset={devicePreset} setDevicePreset={changeDevice} sizeLocked={isBusy} disabled={isBusy || isInspecting} />
              <div className="command-actions">
                {!inspection && <button type="button" className="quick-capture" disabled={!url.trim() || isBusy || isInspecting} onClick={() => void startCapture(true)}><Zap size={14} /> {duplicatedRequest ? "Queue duplicate" : "Quick capture"}</button>}
                {!inspection ? (
                  <button type="button" className="analyze-button" disabled={!url.trim() || isBusy || isInspecting} onClick={() => void analyze()}>{isInspecting ? <span className="loader-circle" /> : <Compass size={16} />} {isInspecting ? "Analyzing…" : "Analyze page"}</button>
                ) : (
                  <button type="button" className="analyze-button" disabled={isBusy || beats.length === 0} onClick={() => void startCapture(false)}><Play size={15} fill="currentColor" /> Start {TIER_CONFIG[renderTier].label.toLowerCase()}</button>
                )}
              </div>
            </section>

            {error && <p className="workflow-error"><AlertTriangle size={15} /> {error}</p>}
            {duplicatedRequest && <p className="duplicate-notice">Exact settings loaded from the library. Queue the duplicate or analyze the page again.</p>}

            <div className={`studio-layout${inspection ? " has-director" : ""}`}>
              <aside className="studio-controls">
                <section className="control-deck">
                  <div className="control-deck-title"><span>Render tier</span><small>{renderTier === "draft" ? "Fast iteration" : renderTier === "standard" ? "Balanced export" : "2× high-detail export"}</small></div>
                  <div className="quality-stack">
                    {(Object.keys(TIER_CONFIG) as RenderTier[]).map((tier) => {
                      const Icon = tier === "draft" ? Zap : tier === "standard" ? Clapperboard : Sparkles;
                      return <button type="button" key={tier} className={renderTier === tier ? "is-active" : ""} onClick={() => { setRenderTier(tier); setDuplicatedRequest(null); }} disabled={isBusy}><Icon size={15} /><span><strong>{TIER_CONFIG[tier].label}</strong><small>{tier === "draft" ? "30 fps · quick" : tier === "standard" ? "60 fps · 1×" : "60 fps · 2×"}</small></span></button>;
                    })}
                  </div>
                </section>

                {!inspection && <section className="control-deck quick-settings">
                  <div className="control-deck-title"><span>Quick motion</span><small>Used without analysis</small></div>
                  <label><span>Scroll mode</span><select value={scrollMode} onChange={(event) => { setScrollMode(event.target.value as typeof scrollMode); setDuplicatedRequest(null); }}><option value="auto">Auto detect</option><option value="document">Document</option><option value="virtual">Virtual</option></select></label>
                  <label><span>Hero hold</span><input type="number" min={0} max={15} step={0.5} value={heroHoldMs / 1000} onChange={(event) => { setHeroHoldMs(Number(event.target.value) * 1000); setDuplicatedRequest(null); }} /><small>seconds</small></label>
                  {scrollMode !== "document" && <><label><span>Virtual cycles</span><input type="number" min={1} max={40} value={virtualCycles} onChange={(event) => { setVirtualCycles(Number(event.target.value)); setDuplicatedRequest(null); }} /></label><label className="toggle-line"><input type="checkbox" checked={useFixedDuration} onChange={(event) => { setUseFixedDuration(event.target.checked); setDuplicatedRequest(null); }} /><span>Use fixed duration</span></label>{useFixedDuration && <label><span>Duration</span><input type="number" min={3} max={120} value={virtualDurationMs / 1000} onChange={(event) => { setVirtualDurationMs(Number(event.target.value) * 1000); setDuplicatedRequest(null); }} /><small>seconds</small></label>}</>}
                </section>}

                <section className="control-deck">
                  <BackgroundCanvasForm backgroundPreset={backgroundPreset} setBackgroundPreset={(value) => { setBackgroundPreset(value); setDuplicatedRequest(null); }} addShadow={addShadow} setAddShadow={(value) => { setAddShadow(value); setDuplicatedRequest(null); }} roundedCorners={roundedCorners} setRoundedCorners={(value) => { setRoundedCorners(value); setDuplicatedRequest(null); }} onApplyStyle={result?.canRestyle ? applyStyle : undefined} isApplyingStyle={isApplyingStyle} />
                </section>
              </aside>

              <div className="studio-stage">
                {inspection && !activeJob ? (
                  <StoryboardDirector inspection={inspection} beats={beats} setBeats={setBeats} startHoldMs={heroHoldMs} setStartHoldMs={setHeroHoldMs} />
                ) : (
                  <div className={`recording-stage${backgroundPreset !== "none" && !result ? " has-canvas-background" : ""}`} style={backgroundPreset !== "none" && !result ? { backgroundImage: `url(/background_presets/${backgroundPreset}.png)` } : undefined}>
                    <BrowserMockup url={url} videoUrl={result?.videoUrl || null} downloadUrl={result?.videoUrl || null} duration={result ? `${(result.durationMs / 1000).toFixed(1)}s` : null} scrollStrategy={result?.scrollStrategy} width={previewWidth} height={previewHeight} isSubmitting={isBusy} isRenderingStyle={isApplyingStyle} recordingElapsed={elapsed} recordingPercent={activeJob?.progress.percent || 0} recordingStatus={activeJob?.progress.message} />
                    {isBusy && <button type="button" className="cancel-capture" onClick={() => void cancel()}><Square size={12} fill="currentColor" /> Cancel capture</button>}
                    {activeJob && ["failed", "cancelled", "interrupted"].includes(activeJob.status) && <div className="failed-capture"><AlertTriangle size={18} /><div><strong>{activeJob.status}</strong><span>{activeJob.error?.message || activeJob.progress.message}</span></div></div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function defaultBeats(inspection: WebsiteInspection): DirectorBeat[] {
  const directed = inspection.storyboard
    .filter((frame) => frame.target.value > 0.001)
    .map((frame, index) => ({
      id: crypto.randomUUID(),
      label: frame.target.value >= 0.98 ? "Page end" : `Waypoint ${index + 1}`,
      target: frame.target.value >= 0.98 ? ({ type: "page-end" } as const) : frame.target,
      progress: frame.target.value,
      transitionMs: 2_000,
      holdMs: 0,
      curve: "ease-in-out",
      imageIndex: frame.imageIndex,
    }));
  return directed.length > 0 ? directed : [{
    id: crypto.randomUUID(),
    label: "Closing frame",
    target: { type: "page-end" },
    progress: 1,
    transitionMs: 1_000,
    holdMs: 0,
    curve: "ease-in-out",
    imageIndex: inspection.storyboard[0]?.imageIndex,
  }];
}

function buildRequest(options: {
  url: string;
  width: number;
  height: number;
  renderTier: RenderTier;
  inspection: WebsiteInspection | null;
  beats: DirectorBeat[];
  scrollMode: "auto" | "document" | "virtual";
  virtualCycles: number;
  useFixedDuration: boolean;
  virtualDurationMs: number;
  heroHoldMs: number;
  backgroundPreset: BackgroundPreset;
  addShadow: boolean;
  roundedCorners: boolean;
}): RecordingRequest {
  const tier = TIER_CONFIG[options.renderTier];
  const animationConfig = options.inspection ? {
    fastMode: tier.fastMode,
    captureMode: tier.captureMode,
    preRecordingDelayMs: tier.preRecordingDelayMs,
    removeOverlayElements: true,
    scrollMode: options.inspection.scrollMode,
    direction: {
      startHoldMs: options.heroHoldMs,
      beats: options.beats.map((beat) => ({ target: beat.target, transitionMs: beat.transitionMs, holdMs: beat.holdMs, curve: { preset: beat.curve } })),
    },
  } : {
    fastMode: tier.fastMode,
    captureMode: tier.captureMode,
    pixelsPerFrame: tier.pixelsPerFrame,
    heroHoldMs: options.heroHoldMs,
    preRecordingDelayMs: tier.preRecordingDelayMs,
    scrollCurve: { preset: "ease-in-out" },
    removeOverlayElements: true,
    scrollMode: options.scrollMode,
    ...(options.scrollMode !== "document" ? { virtualScrollCycles: options.virtualCycles } : {}),
    ...(options.scrollMode !== "document" && options.useFixedDuration ? { virtualScrollDurationMs: options.virtualDurationMs } : {}),
  };
  return {
    targetUrl: options.url.trim(),
    exportFormat: "mp4",
    videoConfig: { framerate: tier.framerate, qualityPreset: tier.qualityPreset, viewport: { width: options.width, height: options.height, deviceScaleFactor: tier.deviceScaleFactor } },
    animationConfig,
    backgroundPreset: options.backgroundPreset,
    addShadow: options.addShadow,
    roundedCorners: options.roundedCorners,
  };
}
