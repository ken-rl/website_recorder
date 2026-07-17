import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Download,
  FileVideo2,
  Link2,
  MonitorCheck,
  Play,
  RefreshCcw,
  Square,
} from "lucide-react";
import { readJsonResponse } from "../lib/http";
import type { RecordingJob, RecordingRequest } from "../lib/productTypes";
import { DEVICE_PRESETS } from "./TargetPageForm";
import BrowserMockup from "./BrowserMockup";

type RenderTier = "draft" | "standard" | "cinematic";

const TIERS = {
  draft: { label: "Draft", detail: "30 fps · quick", fps: 30, scale: 1, quality: "medium", fast: true, mode: "preview", delay: 500, pixels: 12 },
  standard: { label: "Standard", detail: "60 fps · balanced", fps: 60, scale: 1, quality: "medium", fast: false, mode: "export", delay: 2_000, pixels: 16 },
  cinematic: { label: "Cinematic", detail: "60 fps · 2× detail", fps: 60, scale: 2, quality: "high", fast: false, mode: "export", delay: 3_000, pixels: 10 },
} as const;

interface ComparisonStudioProps {
  initialJob?: RecordingJob | null;
  onBusyChange?: (busy: boolean) => void;
  onReset?: () => void;
}

export default function ComparisonStudio({ initialJob, onBusyChange, onReset }: ComparisonStudioProps) {
  const [primaryUrl, setPrimaryUrl] = useState("");
  const [secondaryUrl, setSecondaryUrl] = useState("");
  const [primaryLabel, setPrimaryLabel] = useState("Version A");
  const [secondaryLabel, setSecondaryLabel] = useState("Version B");
  const [devicePreset, setDevicePreset] = useState("1920x1080");
  const [renderTier, setRenderTier] = useState<RenderTier>("draft");
  const [durationSeconds, setDurationSeconds] = useState(18);
  const [activeJob, setActiveJob] = useState<RecordingJob | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState("0.0s");

  const isBusy = Boolean(activeJob && ["queued", "running"].includes(activeJob.status));
  const activeJobId = activeJob?.jobId;
  const activeJobStatus = activeJob?.status;
  const activeJobCreatedAt = activeJob?.createdAt;
  const [width, height] = devicePreset.split("x").map(Number);
  const result = activeJob?.result;

  useEffect(() => onBusyChange?.(isBusy), [isBusy, onBusyChange]);

  useEffect(() => {
    if (!initialJob?.request?.comparison) return;
    loadJobSettings(initialJob);
    setActiveJob(initialJob);
    if (initialJob.status === "completed" && initialJob.result) {
      localStorage.setItem("last-comparison-job-id", initialJob.jobId);
    }
  }, [initialJob]);

  useEffect(() => {
    if (initialJob) return;
    const jobId =
      localStorage.getItem("active-comparison-job-id") ??
      localStorage.getItem("last-comparison-job-id");
    if (!jobId) return;
    void fetch(`/api/jobs/${jobId}`, { cache: "no-store" })
      .then((response) => readJsonResponse<{ ok?: boolean; job: RecordingJob }>(response, "Restore comparison"))
      .then((data) => {
        if (!data.job.request?.comparison) return localStorage.removeItem("active-comparison-job-id");
        loadJobSettings(data.job);
        setActiveJob(data.job);
      })
      .catch(() => localStorage.removeItem("active-comparison-job-id"));
  }, [initialJob]);

  useEffect(() => {
    if (!activeJobId || !activeJobStatus || !["queued", "running"].includes(activeJobStatus)) return;
    localStorage.setItem("active-comparison-job-id", activeJobId);
    const events = new EventSource(`/api/jobs/${activeJobId}/events`);
    let pollTimer: number | undefined;
    let stopped = false;

    const apply = (job: RecordingJob) => {
      if (stopped || job.jobId !== activeJobId) return;
      setActiveJob(job);
      if (!["queued", "running"].includes(job.status)) {
        localStorage.removeItem("active-comparison-job-id");
        if (job.status === "completed") {
          localStorage.setItem("last-comparison-job-id", job.jobId);
        }
        stopped = true;
        events.close();
        if (pollTimer !== undefined) window.clearInterval(pollTimer);
      }
    };
    const poll = async () => {
      try {
        const response = await fetch(`/api/jobs/${activeJobId}`, { cache: "no-store" });
        const data = await readJsonResponse<{ ok?: boolean; job: RecordingJob }>(response, "Refresh comparison");
        if (data.ok) apply(data.job);
      } catch {
        // EventSource reconnects; polling provides a second recovery path.
      }
    };
    events.addEventListener("job", (event) => {
      try {
        apply(JSON.parse((event as MessageEvent).data) as RecordingJob);
      } catch {
        void poll();
      }
    });
    events.addEventListener("error", () => void poll());
    pollTimer = window.setInterval(() => void poll(), 2_000);
    return () => {
      stopped = true;
      events.close();
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
    };
  }, [activeJobId, activeJobStatus]);

  useEffect(() => {
    if (!activeJobId || !activeJobStatus || !activeJobCreatedAt || !["queued", "running"].includes(activeJobStatus)) return;
    const started = Date.parse(activeJobCreatedAt);
    const timer = window.setInterval(
      () => setElapsed(`${((Date.now() - started) / 1_000).toFixed(1)}s`),
      100,
    );
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJobStatus, activeJobCreatedAt]);

  const request = useMemo<RecordingRequest>(() => {
    const tier = TIERS[renderTier];
    return {
      targetUrl: primaryUrl.trim(),
      exportFormat: "mp4",
      videoConfig: {
        framerate: tier.fps,
        qualityPreset: tier.quality,
        viewport: { width, height, deviceScaleFactor: tier.scale },
      },
      animationConfig: {
        pixelsPerFrame: tier.pixels,
        preRecordingDelayMs: tier.delay,
        removeOverlayElements: true,
        scrollCurve: { preset: "ease-in-out" },
        durationMs: durationSeconds * 1_000,
        virtualScrollDurationMs: durationSeconds * 1_000,
        heroHoldMs: 1_500,
        scrollMode: "auto",
        virtualScrollCycles: 8,
        fastMode: tier.fast,
        captureMode: tier.mode,
      },
      backgroundPreset: "none",
      addShadow: false,
      roundedCorners: false,
      comparison: {
        targetUrl: secondaryUrl.trim(),
        primaryLabel: primaryLabel.trim(),
        secondaryLabel: secondaryLabel.trim(),
        layout: "side-by-side",
      },
    };
  }, [primaryUrl, secondaryUrl, primaryLabel, secondaryLabel, width, height, renderTier, durationSeconds]);

  const canStart =
    primaryUrl.trim() &&
    secondaryUrl.trim() &&
    primaryLabel.trim() &&
    secondaryLabel.trim() &&
    !isBusy;

  const start = async () => {
    if (!canStart) return;
    setError("");
    setActiveJob(null);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await readJsonResponse<{ ok?: boolean; jobId: string; statusUrl: string; error?: string }>(response, "Queue comparison");
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not queue comparison");
      localStorage.setItem("active-comparison-job-id", data.jobId);
      const jobResponse = await fetch(data.statusUrl, { cache: "no-store" });
      const jobData = await readJsonResponse<{ ok?: boolean; job: RecordingJob; error?: string }>(jobResponse, "Load comparison");
      if (!jobResponse.ok || !jobData.ok) throw new Error(jobData.error || "Could not load comparison");
      setActiveJob(jobData.job);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue comparison");
    }
  };

  const cancel = async () => {
    if (!activeJob) return;
    try {
      const response = await fetch(`/api/jobs/${activeJob.jobId}/cancel`, { method: "POST" });
      const data = await readJsonResponse<{ ok?: boolean; error?: string }>(response, "Cancel comparison");
      if (!response.ok) setError(data.error || "Could not cancel comparison");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not cancel comparison");
    }
  };

  const retry = async () => {
    if (!activeJob) return;
    setError("");
    try {
      const response = await fetch(`/api/jobs/${activeJob.jobId}/retry`, { method: "POST" });
      const data = await readJsonResponse<{ ok?: boolean; jobId: string; error?: string }>(response, "Retry comparison");
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not retry comparison");
      const freshResponse = await fetch(`/api/jobs/${data.jobId}`);
      const fresh = await readJsonResponse<{ ok?: boolean; job: RecordingJob }>(freshResponse, "Load comparison");
      localStorage.setItem("active-comparison-job-id", data.jobId);
      setActiveJob(fresh.job);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not retry comparison");
    }
  };

  const swap = () => {
    beginEdit();
    setPrimaryUrl(secondaryUrl);
    setSecondaryUrl(primaryUrl);
    setPrimaryLabel(secondaryLabel);
    setSecondaryLabel(primaryLabel);
  };

  const clearResult = () => {
    beginEdit();
  };

  const beginEdit = () => {
    setActiveJob(null);
    localStorage.removeItem("active-comparison-job-id");
    localStorage.removeItem("last-comparison-job-id");
    onReset?.();
  };

  return (
    <section className="comparison-page">
      <div className="comparison-input-rail">
        <ComparisonTarget side="A" accent="blue" label={primaryLabel} url={primaryUrl} onLabel={(value) => { beginEdit(); setPrimaryLabel(value); }} onUrl={(value) => { beginEdit(); setPrimaryUrl(value); }} disabled={isBusy} />
        <button type="button" className="comparison-swap" onClick={swap} disabled={isBusy} title="Swap sides" aria-label="Swap sides"><ArrowLeftRight size={16} /></button>
        <ComparisonTarget side="B" accent="cyan" label={secondaryLabel} url={secondaryUrl} onLabel={(value) => { beginEdit(); setSecondaryLabel(value); }} onUrl={(value) => { beginEdit(); setSecondaryUrl(value); }} disabled={isBusy} />
        <div className="comparison-rail-actions">
          {result ? (
            <>
              <button type="button" className="comparison-new" onClick={clearResult} title="New comparison"><RefreshCcw size={15} /><span>New</span></button>
              <a className="comparison-export" href={result.videoUrl} download="comparison.mp4"><Download size={15} /> Export MP4</a>
            </>
          ) : (
            <button type="button" className="comparison-start" onClick={() => void start()} disabled={!canStart}>
              {isBusy ? <span className="loader-circle" /> : <Play size={15} fill="currentColor" />}
              {isBusy ? "Capturing…" : "Compare pages"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="workflow-error"><AlertTriangle size={15} /> {error}</p>}

      <div className="comparison-controls" aria-label="Shared comparison settings">
        <div className="comparison-control-group">
          <span>Viewport</span>
          <div className="comparison-device-grid">
            {DEVICE_PRESETS.map(({ value, label, Icon }) => (
              <button type="button" key={value} className={devicePreset === value ? "is-active" : ""} onClick={() => { beginEdit(); setDevicePreset(value); }} disabled={isBusy} title={value.replace("x", " × ")} aria-label={`${label} viewport, ${value.replace("x", " by ")}`}>
                <Icon size={14} /><span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="comparison-control-divider" />
        <div className="comparison-control-group">
          <span>Quality</span>
          <div className="comparison-tier-list">
            {(Object.keys(TIERS) as RenderTier[]).map((tier) => (
              <button type="button" key={tier} className={renderTier === tier ? "is-active" : ""} onClick={() => { beginEdit(); setRenderTier(tier); }} disabled={isBusy} title={TIERS[tier].detail}>
                {TIERS[tier].label}
              </button>
            ))}
          </div>
        </div>
        <div className="comparison-control-divider" />
        <label className="comparison-duration">
          <span>Timeline <b>{durationSeconds}s</b></span>
          <input type="range" min={8} max={45} value={durationSeconds} onChange={(event) => { beginEdit(); setDurationSeconds(Number(event.target.value)); }} disabled={isBusy} />
        </label>
        <p className="comparison-control-note">Shared settings · popups removed · ending held automatically</p>
      </div>

      <div className="comparison-stage">
          {result ? (
            <BrowserMockup
              url={`${primaryLabel} · ${secondaryLabel}`}
              videoUrl={result.videoUrl}
              downloadUrl={result.videoUrl}
              duration={`${(result.durationMs / 1_000).toFixed(1)}s`}
              scrollStrategy={result.scrollStrategy}
              width={result.viewport.width}
              height={result.viewport.height}
              isSubmitting={false}
            />
          ) : (
            <ComparisonCanvas
              primaryLabel={primaryLabel || "Version A"}
              secondaryLabel={secondaryLabel || "Version B"}
              primaryUrl={primaryUrl}
              secondaryUrl={secondaryUrl}
              job={activeJob}
              elapsed={elapsed}
            />
          )}
          {isBusy && <button type="button" className="cancel-capture" onClick={() => void cancel()}><Square size={12} fill="currentColor" /> Cancel comparison</button>}
          {activeJob && ["failed", "cancelled", "interrupted"].includes(activeJob.status) && (
            <div className="failed-capture"><AlertTriangle size={18} /><div><strong>{activeJob.status}</strong><span>{activeJob.error?.message || activeJob.progress.message}</span></div><button type="button" onClick={() => void retry()}><RefreshCcw size={13} /> Retry</button></div>
          )}
      </div>
    </section>
  );

  function loadJobSettings(job: RecordingJob) {
    const comparison = job.request?.comparison;
    if (!comparison || !job.request) return;
    setPrimaryUrl(job.request.targetUrl);
    setSecondaryUrl(comparison.targetUrl);
    setPrimaryLabel(comparison.primaryLabel);
    setSecondaryLabel(comparison.secondaryLabel);
    const viewport = job.request.videoConfig.viewport;
    const preset = `${viewport.width}x${viewport.height}`;
    if (DEVICE_PRESETS.some((item) => item.value === preset)) setDevicePreset(preset);
    setRenderTier(
      job.request.animationConfig.fastMode === true
        ? "draft"
        : viewport.deviceScaleFactor === 2
          ? "cinematic"
          : "standard",
    );
    const duration = Number(job.request.animationConfig.durationMs);
    if (duration) setDurationSeconds(Math.round(duration / 1_000));
  }
}

function ComparisonTarget(props: {
  side: string;
  accent: "blue" | "cyan";
  label: string;
  url: string;
  onLabel: (value: string) => void;
  onUrl: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className={`comparison-target is-${props.accent}`}>
      <span className="comparison-side">{props.side}</span>
      <div>
        <input className="comparison-label-input" value={props.label} onChange={(event) => props.onLabel(event.target.value)} maxLength={48} aria-label={`Side ${props.side} label`} disabled={props.disabled} />
        <input type="url" value={props.url} onChange={(event) => props.onUrl(event.target.value)} placeholder={`https://version-${props.side.toLowerCase()}.com`} aria-label={`Side ${props.side} URL`} disabled={props.disabled} />
      </div>
    </div>
  );
}

function ComparisonCanvas(props: {
  primaryLabel: string;
  secondaryLabel: string;
  primaryUrl: string;
  secondaryUrl: string;
  job: RecordingJob | null;
  elapsed: string;
}) {
  const recording = props.job && ["queued", "running"].includes(props.job.status);
  return (
    <div className={`comparison-canvas${recording ? " is-recording" : ""}`}>
      <div className="comparison-canvas-topline">
        <span>{recording ? props.job?.progress.message : "Synchronized output preview"}</span>
        <small>{recording ? props.elapsed : "SIDE BY SIDE · 1 TIMELINE"}</small>
      </div>
      <div className="comparison-panels">
        <PreviewPanel side="A" label={props.primaryLabel} url={props.primaryUrl} />
        <div className="comparison-axis"><span><ArrowLeftRight size={13} /></span></div>
        <PreviewPanel side="B" label={props.secondaryLabel} url={props.secondaryUrl} />
      </div>
      {recording && (
        <div className="comparison-progress">
          <i style={{ width: `${props.job?.progress.percent ?? 0}%` }} />
          <span>{props.job?.progress.percent ?? 0}%</span>
        </div>
      )}
      {!recording && (
        <div className="comparison-automation">
          <span><MonitorCheck size={13} /><b>Matched viewport</b></span>
          <span><Link2 size={13} /><b>Synchronized scroll</b></span>
          <span><FileVideo2 size={13} /><b>One composed MP4</b></span>
        </div>
      )}
    </div>
  );
}

function PreviewPanel({ side, label, url }: { side: string; label: string; url: string }) {
  const host = safeHost(url);
  return (
    <div className="comparison-panel">
      <div className="comparison-browser-bar"><span>{side}</span><div><i /><i /><i /></div><small>{host}</small></div>
      <div className="comparison-ghost-page">
        <span className="ghost-kicker" />
        <strong>{label}</strong>
        <span className="ghost-copy" />
        <span className="ghost-copy is-short" />
        <span className="ghost-button" />
        <div><i /><i /><i /></div>
      </div>
    </div>
  );
}

function safeHost(url: string) {
  if (!url) return "Paste a URL above";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
