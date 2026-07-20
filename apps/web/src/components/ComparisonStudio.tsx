import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Clapperboard,
  Download,
  Play,
  RefreshCcw,
  Sparkles,
  Square,
  Zap,
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
  const [primaryLogo, setPrimaryLogo] = useState("A");
  const [secondaryLogo, setSecondaryLogo] = useState("B");
  const [primaryLogoDataUrl, setPrimaryLogoDataUrl] = useState<string | undefined>(undefined);
  const [secondaryLogoDataUrl, setSecondaryLogoDataUrl] = useState<string | undefined>(undefined);
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
        primaryLogo: primaryLogo.trim(),
        secondaryLogo: secondaryLogo.trim(),
        primaryLogoDataUrl: primaryLogoDataUrl || undefined,
        secondaryLogoDataUrl: secondaryLogoDataUrl || undefined,
        layout: "side-by-side",
      },
    };
  }, [primaryUrl, secondaryUrl, primaryLabel, secondaryLabel, primaryLogo, secondaryLogo, primaryLogoDataUrl, secondaryLogoDataUrl, width, height, renderTier, durationSeconds]);

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
    setPrimaryLogo(secondaryLogo);
    setSecondaryLogo(primaryLogo);
    setPrimaryLogoDataUrl(secondaryLogoDataUrl);
    setSecondaryLogoDataUrl(primaryLogoDataUrl);
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
      <div className="capture-command-bar comparison-input-rail">
        <ComparisonTarget side="A" accent="blue" label={primaryLabel} logo={primaryLogo} logoDataUrl={primaryLogoDataUrl} url={primaryUrl} onLabel={(value) => { beginEdit(); setPrimaryLabel(value); }} onLogo={(value) => { beginEdit(); setPrimaryLogo(value); }} onLogoDataUrl={(value) => { beginEdit(); setPrimaryLogoDataUrl(value); }} onUrl={(value) => { beginEdit(); setPrimaryUrl(value); }} disabled={isBusy} />
        <button type="button" className="comparison-swap" onClick={swap} disabled={isBusy} title="Swap sides" aria-label="Swap sides"><ArrowLeftRight size={16} /></button>
        <ComparisonTarget side="B" accent="cyan" label={secondaryLabel} logo={secondaryLogo} logoDataUrl={secondaryLogoDataUrl} url={secondaryUrl} onLabel={(value) => { beginEdit(); setSecondaryLabel(value); }} onLogo={(value) => { beginEdit(); setSecondaryLogo(value); }} onLogoDataUrl={(value) => { beginEdit(); setSecondaryLogoDataUrl(value); }} onUrl={(value) => { beginEdit(); setSecondaryUrl(value); }} disabled={isBusy} />
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

      <div className="studio-layout comparison-workspace">
        <aside className="studio-controls comparison-settings" aria-label="Comparison settings">
          <section className="control-deck">
            <div className="control-deck-title"><span>Output quality</span><small>Applies to both pages</small></div>
            <div className="quality-stack">
              {(Object.keys(TIERS) as RenderTier[]).map((tier) => {
                const Icon = tier === "draft" ? Zap : tier === "standard" ? Clapperboard : Sparkles;
                return (
                  <button type="button" key={tier} className={renderTier === tier ? "is-active" : ""} onClick={() => { beginEdit(); setRenderTier(tier); }} disabled={isBusy}>
                    <Icon size={15} /><span><strong>{TIERS[tier].label}</strong><small>{TIERS[tier].detail}</small></span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="control-deck">
            <div className="control-deck-title"><span>Viewport</span><small>Matched breakpoint</small></div>
            <div className="recorder-device-row comparison-device-grid" role="radiogroup" aria-label="Shared viewport">
              {DEVICE_PRESETS.map(({ value, label, Icon }) => (
                <button type="button" role="radio" aria-checked={devicePreset === value} key={value} className={`recorder-device-btn${devicePreset === value ? " is-active" : ""}`} onClick={() => { beginEdit(); setDevicePreset(value); }} disabled={isBusy} title={value.replace("x", " × ")}>
                  <Icon size={15} /><span>{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="control-deck comparison-timing">
            <div className="control-deck-title"><span>Synchronized timeline</span><small>{durationSeconds}s</small></div>
            <input type="range" min={8} max={45} value={durationSeconds} onChange={(event) => { beginEdit(); setDurationSeconds(Number(event.target.value)); }} disabled={isBusy} aria-label="Comparison duration" />
            <div className="comparison-duration-scale"><span>8s</span><span>45s</span></div>
            <p>Both pages use the same viewport and scroll duration. Popups are removed, the shorter ending is held, and the final MP4 is composed automatically.</p>
          </section>
        </aside>

        <div className="studio-stage">
          <div className="recording-stage comparison-stage">
          {result ? (
            <div
              className="recorder-preview"
              style={{
                "--preview-w": String(result.viewport.width),
                "--preview-h": String(result.viewport.height),
              } as React.CSSProperties}
            >
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
            </div>
          ) : (
            <ComparisonCanvas
              primaryLabel={primaryLabel || "Version A"}
              secondaryLabel={secondaryLabel || "Version B"}
              primaryLogo={primaryLogo || "A"}
              secondaryLogo={secondaryLogo || "B"}
              primaryLogoDataUrl={primaryLogoDataUrl}
              secondaryLogoDataUrl={secondaryLogoDataUrl}
              primaryUrl={primaryUrl}
              secondaryUrl={secondaryUrl}
              job={activeJob}
              elapsed={elapsed}
              width={width}
              height={height}
            />
          )}
          {isBusy && <button type="button" className="cancel-capture" onClick={() => void cancel()}><Square size={12} fill="currentColor" /> Cancel comparison</button>}
          {activeJob && ["failed", "cancelled", "interrupted"].includes(activeJob.status) && (
            <div className="failed-capture"><AlertTriangle size={18} /><div><strong>{activeJob.status}</strong><span>{activeJob.error?.message || activeJob.progress.message}</span></div><button type="button" onClick={() => void retry()}><RefreshCcw size={13} /> Retry</button></div>
          )}
          </div>
        </div>
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
    setPrimaryLogo(comparison.primaryLogo || "A");
    setSecondaryLogo(comparison.secondaryLogo || "B");
    setPrimaryLogoDataUrl(comparison.primaryLogoDataUrl);
    setSecondaryLogoDataUrl(comparison.secondaryLogoDataUrl);
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
  logo: string;
  logoDataUrl?: string;
  url: string;
  onLabel: (value: string) => void;
  onLogo: (value: string) => void;
  onLogoDataUrl: (value: string | undefined) => void;
  onUrl: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className={`comparison-target is-${props.accent}`}>
      <div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "4px", alignItems: "center" }}>
          <LogoUpload
            accent={props.accent}
            logoDataUrl={props.logoDataUrl}
            logoText={props.logo}
            disabled={props.disabled}
            side={props.side}
            onLogoDataUrl={props.onLogoDataUrl}
            onLogoText={props.onLogo}
          />
          <input className="comparison-label-input" value={props.label} onChange={(event) => props.onLabel(event.target.value)} maxLength={48} aria-label={`Side ${props.side} label`} disabled={props.disabled} style={{ flexGrow: 1 }} />
        </div>
        <input type="url" value={props.url} onChange={(event) => props.onUrl(event.target.value)} placeholder={`https://version-${props.side.toLowerCase()}.com`} aria-label={`Side ${props.side} URL`} disabled={props.disabled} />
      </div>
    </div>
  );
}

function LogoUpload(props: {
  accent: "blue" | "cyan";
  logoDataUrl?: string;
  logoText: string;
  disabled: boolean;
  side: string;
  onLogoDataUrl: (value: string | undefined) => void;
  onLogoText: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const readFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 512_000) {
      alert("Logo image must be smaller than 512 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        props.onLogoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }, [props]);

  const onFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) readFile(file);
    // reset so same file can be re-selected
    event.target.value = "";
  }, [readFile]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) readFile(file);
  }, [readFile]);

  const clear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    props.onLogoDataUrl(undefined);
  }, [props]);

  const badgeColor = props.accent === "blue" ? "#3158c9" : "#087e72";

  return (
    <div
      className={`comparison-logo-upload${dragOver ? " is-drag-over" : ""}${props.disabled ? " is-disabled" : ""}`}
      title={props.logoDataUrl ? "Click to replace logo image" : "Click or drop an image to use as logo"}
      onClick={() => !props.disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!props.disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={!props.disabled ? onDrop : undefined}
      role="button"
      tabIndex={props.disabled ? -1 : 0}
      onKeyDown={(e) => e.key === "Enter" && !props.disabled && inputRef.current?.click()}
      aria-label={`Side ${props.side} logo image upload`}
    >
      {props.logoDataUrl ? (
        <>
          <img src={props.logoDataUrl} alt="logo" className="comparison-logo-img" />
          {!props.disabled && (
            <button
              type="button"
              className="comparison-logo-clear"
              onClick={clear}
              aria-label="Remove logo image"
            >×</button>
          )}
        </>
      ) : (
        <span className="comparison-logo-text" style={{ background: badgeColor }}>
          <input
            className="comparison-logo-input-inline"
            value={props.logoText}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => props.onLogoText(e.target.value)}
            maxLength={8}
            placeholder={props.side}
            disabled={props.disabled}
            aria-label={`Side ${props.side} badge text`}
            style={{ background: badgeColor }}
          />
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        style={{ display: "none" }}
        onChange={onFileChange}
        disabled={props.disabled}
        aria-hidden="true"
      />
    </div>
  );
}

function ComparisonCanvas(props: {
  primaryLabel: string;
  secondaryLabel: string;
  primaryLogo: string;
  secondaryLogo: string;
  primaryLogoDataUrl?: string;
  secondaryLogoDataUrl?: string;
  primaryUrl: string;
  secondaryUrl: string;
  job: RecordingJob | null;
  elapsed: string;
  width: number;
  height: number;
}) {
  const recording = props.job && ["queued", "running"].includes(props.job.status);
  const isPortrait = props.width < props.height;
  const previewStyle = {
    "--comparison-ratio": String(props.width / props.height),
  } as React.CSSProperties;
  return (
    <div className={`comparison-canvas${recording ? " is-recording" : ""}${isPortrait ? " is-portrait" : " is-landscape"}`} style={previewStyle}>
      <div className="comparison-preview-labels">
        <span>
          {props.primaryLogoDataUrl
            ? <i style={{ minWidth: "22px", width: "auto", padding: 0, background: "transparent" }}><img src={props.primaryLogoDataUrl} alt="" style={{ width: "22px", height: "22px", objectFit: "contain", borderRadius: "4px" }} /></i>
            : <i style={{ minWidth: "22px", width: "auto", paddingInline: "4px" }}>{props.primaryLogo}</i>}
          <b>{props.primaryLabel}</b>
        </span>
        <span>
          {props.secondaryLogoDataUrl
            ? <i style={{ minWidth: "22px", width: "auto", padding: 0, background: "transparent" }}><img src={props.secondaryLogoDataUrl} alt="" style={{ width: "22px", height: "22px", objectFit: "contain", borderRadius: "4px" }} /></i>
            : <i style={{ minWidth: "22px", width: "auto", paddingInline: "4px", background: "var(--accent-secondary)", color: "#071b18" }}>{props.secondaryLogo}</i>}
          <b>{props.secondaryLabel}</b>
        </span>
      </div>
      <div className="comparison-panels">
        <PreviewPanel url={props.primaryUrl} width={props.width} height={props.height} recording={Boolean(recording)} />
        <PreviewPanel url={props.secondaryUrl} width={props.width} height={props.height} recording={Boolean(recording)} />
      </div>
      {recording && (
        <div className="comparison-capture-state" role="status" aria-live="polite">
          <span>{props.job?.progress.message}</span>
          <div><i style={{ width: `${props.job?.progress.percent ?? 0}%` }} /></div>
          <small>{props.elapsed} · {props.job?.progress.percent ?? 0}%</small>
        </div>
      )}
    </div>
  );
}

function PreviewPanel({ url, width, height, recording }: { url: string; width: number; height: number; recording: boolean }) {
  return (
    <div className="comparison-panel" style={{ aspectRatio: `${width} / ${height}` }}>
      <div className={`browser-placeholder ${recording ? "browser-placeholder-recording" : "browser-placeholder-idle"}`}>
        <span className="idle-viewport-badge">{width} × {height}</span>
        <div className="placeholder-title">{recording ? "Capturing" : "Ready to compare"}</div>
        <p className="idle-preview-url">{url || "Paste a URL above"}</p>
      </div>
    </div>
  );
}
