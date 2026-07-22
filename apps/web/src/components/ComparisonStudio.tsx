import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Clapperboard,
  Download,
  Monitor,
  Play,
  RefreshCcw,
  Smartphone,
  Sparkles,
  Square,
  Tablet,
  Upload,
  Zap,
} from "lucide-react";
import { readJsonResponse } from "../lib/http";
import type { ComparisonSyncMode, RecordingJob, RecordingRequest } from "../lib/productTypes";
import { DEVICE_PRESETS } from "./TargetPageForm";
import BrowserMockup from "./BrowserMockup";

type RenderTier = "draft" | "standard" | "cinematic";

const DEVICE_PAIRS = [
  { id: "desktop-mobile", label: "Desktop + mobile", detail: "1440×900 · 390×844", desktop: [1440, 900], mobile: [390, 844], mobileLabel: "Mobile" },
  { id: "laptop-mobile", label: "Laptop + mobile", detail: "1366×768 · 390×844", desktop: [1366, 768], mobile: [390, 844], mobileLabel: "Mobile" },
  { id: "desktop-tablet", label: "Desktop + tablet", detail: "1440×900 · 768×1024", desktop: [1440, 900], mobile: [768, 1024], mobileLabel: "Tablet" },
] as const;

const SYNC_OPTIONS: Array<{ value: ComparisonSyncMode; label: string; detail: string }> = [
  { value: "match-progress", label: "Match progress", detail: "Both views reach the bottom together." },
  { value: "match-speed", label: "Match speed", detail: "The shorter page finishes and holds." },
  { value: "independent", label: "Natural timing", detail: "Each page uses its own scroll length." },
];

const TIERS = {
  draft: { label: "Draft", detail: "30 fps · quick", fps: 30, scale: 1, quality: "medium", fast: true, mode: "preview", delay: 500, pixels: 12 },
  standard: { label: "Standard", detail: "60 fps · balanced", fps: 60, scale: 1, quality: "medium", fast: false, mode: "export", delay: 2_000, pixels: 16 },
  cinematic: { label: "Cinematic", detail: "60 fps · 2× detail", fps: 60, scale: 2, quality: "high", fast: false, mode: "export", delay: 3_000, pixels: 10 },
} as const;

interface ComparisonStudioProps {
  initialJob?: RecordingJob | null;
  onBusyChange?: (busy: boolean) => void;
  onReset?: () => void;
  mode: "compare" | "responsive";
}

export default function ComparisonStudio({ initialJob, onBusyChange, onReset, mode }: ComparisonStudioProps) {
  const [studioMode, setStudioMode] = useState<"compare" | "responsive">(mode);
  const [primaryUrl, setPrimaryUrl] = useState("");
  const [secondaryUrl, setSecondaryUrl] = useState("");
  const [primaryLabel, setPrimaryLabel] = useState(mode === "responsive" ? "Desktop View" : "Version A");
  const [secondaryLabel, setSecondaryLabel] = useState(mode === "responsive" ? "Mobile View" : "Version B");
  const [primaryLogo, setPrimaryLogo] = useState(mode === "responsive" ? "Desk" : "A");
  const [secondaryLogo, setSecondaryLogo] = useState("B");
  const [primaryLogoDataUrl, setPrimaryLogoDataUrl] = useState<string | undefined>(undefined);
  const [secondaryLogoDataUrl, setSecondaryLogoDataUrl] = useState<string | undefined>(undefined);
  const [devicePreset, setDevicePreset] = useState("1920x1080");
  const [devicePairId, setDevicePairId] = useState("desktop-mobile");
  const [desktopSize, setDesktopSize] = useState<[number, number]>([1440, 900]);
  const [mobileSize, setMobileSize] = useState<[number, number]>([390, 844]);
  const [syncMode, setSyncMode] = useState<ComparisonSyncMode>(mode === "responsive" ? "match-progress" : "match-speed");
  const [renderTier, setRenderTier] = useState<RenderTier>("draft");
  const [durationSeconds, setDurationSeconds] = useState(18);
  const [scrollCurvePreset, setScrollCurvePreset] = useState("ease-in-out");
  const [scrollCurveBezier, setScrollCurveBezier] = useState<[number, number, number, number]>([0.42, 0, 0.58, 1]);
  const [activeJob, setActiveJob] = useState<RecordingJob | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState("0.0s");
  const [isDirty, setIsDirty] = useState(false);

  const activeStorageKey = `active-${mode}-job-id`;
  const lastStorageKey = `last-${mode}-job-id`;
  const isBusy = Boolean(activeJob && ["queued", "running"].includes(activeJob.status));
  const activeJobId = activeJob?.jobId;
  const activeJobStatus = activeJob?.status;
  const activeJobCreatedAt = activeJob?.createdAt;
  const [width, height] = devicePreset.split("x").map(Number);
  const selectedPair = DEVICE_PAIRS.find((pair) => pair.id === devicePairId);
  const devicePair = selectedPair ?? { mobileLabel: mobileSize[0] >= 600 ? "Tablet" : "Mobile" };
  const [desktopWidth, desktopHeight] = desktopSize;
  const [mobileWidth, mobileHeight] = mobileSize;
  const result = activeJob?.result;
  const primaryUrlError = primaryUrl.trim() && !isHttpUrl(primaryUrl) ? "Enter a complete http:// or https:// URL" : "";
  const secondaryUrlError = secondaryUrl.trim() && !isHttpUrl(secondaryUrl) ? "Enter a complete http:// or https:// URL" : "";
  const dimensionError = studioMode === "responsive" && !(
    [desktopWidth, mobileWidth].every((value) => Number.isInteger(value) && value >= 320 && value <= 3840) &&
    [desktopHeight, mobileHeight].every((value) => Number.isInteger(value) && value >= 240 && value <= 2160)
  )
    ? "Widths must be 320–3840 and heights 240–2160"
    : "";

  useEffect(() => onBusyChange?.(isBusy), [isBusy, onBusyChange]);

  useEffect(() => {
    setStudioMode(mode);
    setPrimaryLabel(mode === "responsive" ? "Desktop View" : "Version A");
    setSecondaryLabel(mode === "responsive" ? "Mobile View" : "Version B");
    setPrimaryLogo(mode === "responsive" ? "Desk" : "A");
    setSecondaryLogo(mode === "responsive" ? "Mob" : "B");
    setPrimaryUrl("");
    setSecondaryUrl("");
    setPrimaryLogoDataUrl(undefined);
    setSecondaryLogoDataUrl(undefined);
    setActiveJob(null);
    setError("");
    setIsDirty(false);
    setSyncMode(mode === "responsive" ? "match-progress" : "match-speed");
    setDevicePairId("desktop-mobile");
    setDesktopSize([1440, 900]);
    setMobileSize([390, 844]);
    setScrollCurvePreset("ease-in-out");
    setScrollCurveBezier([0.42, 0, 0.58, 1]);
  }, [mode]);

  useEffect(() => {
    if (!initialJob?.request) return;
    loadJobSettings(initialJob);
    setActiveJob(initialJob);
    if (initialJob.status === "completed" && initialJob.result) {
      localStorage.setItem(lastStorageKey, initialJob.jobId);
    }
  }, [initialJob, lastStorageKey]);

  useEffect(() => {
    if (initialJob) return;
    const jobId = localStorage.getItem(activeStorageKey) ?? localStorage.getItem(lastStorageKey);
    if (!jobId) return;
    void fetch(`/api/jobs/${jobId}`, { cache: "no-store" })
      .then((response) => readJsonResponse<{ ok?: boolean; job: RecordingJob }>(response, `Restore ${mode}`))
      .then((data) => {
        const matchesMode = mode === "compare"
          ? Boolean(data.job.request?.comparison)
          : Boolean(data.job.request?.responsiveness);
        if (!matchesMode) {
          localStorage.removeItem(activeStorageKey);
          localStorage.removeItem(lastStorageKey);
          return;
        }
        loadJobSettings(data.job);
        setActiveJob(data.job);
      })
      .catch(() => localStorage.removeItem(activeStorageKey));
  }, [initialJob, mode, activeStorageKey, lastStorageKey]);

  useEffect(() => {
    if (!activeJobId || !activeJobStatus || !["queued", "running"].includes(activeJobStatus)) return;
    localStorage.setItem(activeStorageKey, activeJobId);
    const events = new EventSource(`/api/jobs/${activeJobId}/events`);
    let pollTimer: number | undefined;
    let stopped = false;

    const apply = (job: RecordingJob) => {
      if (stopped || job.jobId !== activeJobId) return;
      setActiveJob(job);
      if (!["queued", "running"].includes(job.status)) {
        localStorage.removeItem(activeStorageKey);
        if (job.status === "completed") {
          localStorage.setItem(lastStorageKey, job.jobId);
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
  }, [activeJobId, activeJobStatus, activeStorageKey, lastStorageKey]);

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
    const base = {
      targetUrl: primaryUrl.trim(),
      exportFormat: "mp4" as const,
      videoConfig: {
        framerate: tier.fps,
        qualityPreset: tier.quality,
        viewport: {
          width: studioMode === "responsive" ? desktopWidth : width,
          height: studioMode === "responsive" ? desktopHeight : height,
          deviceScaleFactor: tier.scale,
        },
      },
      animationConfig: {
        pixelsPerFrame: tier.pixels,
        preRecordingDelayMs: tier.delay,
        removeOverlayElements: true,
        scrollCurve: scrollCurvePreset === "custom"
          ? { preset: "custom" as const, customPoints: { x1: scrollCurveBezier[0], y1: scrollCurveBezier[1], x2: scrollCurveBezier[2], y2: scrollCurveBezier[3] } }
          : { preset: scrollCurvePreset as any },
        durationMs: durationSeconds * 1_000,
        virtualScrollDurationMs: durationSeconds * 1_000,
        heroHoldMs: 1_500,
        scrollMode: "auto" as const,
        virtualScrollCycles: 8,
        fastMode: tier.fast,
        captureMode: tier.mode,
      },
      backgroundPreset: "none",
      addShadow: false,
      roundedCorners: false,
    };
    if (studioMode === "responsive") {
      return {
        ...base,
        responsiveness: {
          syncMode,
          desktopLabel: "Desktop View",
          mobileLabel: `${devicePair.mobileLabel} View`,
          desktopWidth,
          desktopHeight,
          mobileWidth,
          mobileHeight,
        },
      };
    } else {
      return {
        ...base,
        comparison: {
          targetUrl: secondaryUrl.trim(),
          syncMode,
          primaryLabel: primaryLabel.trim(),
          secondaryLabel: secondaryLabel.trim(),
          primaryLogo: primaryLogo.trim(),
          secondaryLogo: secondaryLogo.trim(),
          primaryLogoDataUrl: primaryLogoDataUrl || undefined,
          secondaryLogoDataUrl: secondaryLogoDataUrl || undefined,
          layout: "side-by-side",
        },
      };
    }
  }, [studioMode, primaryUrl, secondaryUrl, primaryLabel, secondaryLabel, primaryLogo, secondaryLogo, primaryLogoDataUrl, secondaryLogoDataUrl, width, height, desktopWidth, desktopHeight, mobileWidth, mobileHeight, devicePair.mobileLabel, syncMode, renderTier, durationSeconds, scrollCurvePreset, JSON.stringify(scrollCurveBezier)]);

  const canStart = Boolean(
    primaryUrl.trim() &&
    !primaryUrlError &&
    !dimensionError &&
    (studioMode === "responsive" || (secondaryUrl.trim() && !secondaryUrlError)) &&
    (studioMode === "responsive" || (primaryLabel.trim() && secondaryLabel.trim())) &&
    !isBusy
  );

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
      localStorage.setItem(activeStorageKey, data.jobId);
      const jobResponse = await fetch(data.statusUrl, { cache: "no-store" });
      const jobData = await readJsonResponse<{ ok?: boolean; job: RecordingJob; error?: string }>(jobResponse, "Load comparison");
      if (!jobResponse.ok || !jobData.ok) throw new Error(jobData.error || "Could not load comparison");
      setActiveJob(jobData.job);
      setIsDirty(false);
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
      localStorage.setItem(activeStorageKey, data.jobId);
      setActiveJob(fresh.job);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not retry comparison");
    }
  };

  const swap = () => {
    if (studioMode === "responsive") return;
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
    setActiveJob(null);
    setIsDirty(false);
    localStorage.removeItem(activeStorageKey);
    localStorage.removeItem(lastStorageKey);
    onReset?.();
  };

  const beginEdit = () => {
    setIsDirty(true);
  };

  return (
    <section className={`comparison-page is-${studioMode}`} onKeyDown={(event) => { if (event.key === "Enter" && canStart && (event.target as HTMLElement).tagName === "INPUT") void start(); }}>
      <div className={`capture-command-bar comparison-input-rail${studioMode === "responsive" ? " is-responsive" : ""}`}>
        {studioMode === "responsive" ? (
          <div className="url-input-wrap capture-url-wrap" style={{ flex: 1, minWidth: 0 }}>
            <svg
              className="url-input-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <input
              type="url"
              className="url-input recorder-url-input"
              value={primaryUrl}
              onChange={(event) => {
                beginEdit();
                setPrimaryUrl(event.target.value);
                setSecondaryUrl(event.target.value);
              }}
              placeholder="https://yoursite.com"
              aria-label="Target website URL"
              disabled={isBusy}
            />
          </div>
        ) : (
          <>
            <ComparisonTarget side="A" accent="blue" label={primaryLabel} logo={primaryLogo} logoDataUrl={primaryLogoDataUrl} url={primaryUrl} onLabel={(value) => { beginEdit(); setPrimaryLabel(value); }} onLogo={(value) => { beginEdit(); setPrimaryLogo(value); }} onLogoDataUrl={(value) => { beginEdit(); setPrimaryLogoDataUrl(value); }} onUrl={(value) => { beginEdit(); setPrimaryUrl(value); }} disabled={isBusy} />
            <button type="button" className="comparison-swap" onClick={swap} disabled={isBusy} title="Swap sides" aria-label="Swap sides"><ArrowLeftRight size={16} /></button>
            <ComparisonTarget
              side="B"
              accent="cyan"
              label={secondaryLabel}
              logo={secondaryLogo}
              logoDataUrl={secondaryLogoDataUrl}
              url={secondaryUrl}
              onLabel={(value) => { beginEdit(); setSecondaryLabel(value); }}
              onLogo={(value) => { beginEdit(); setSecondaryLogo(value); }}
              onLogoDataUrl={(value) => { beginEdit(); setSecondaryLogoDataUrl(value); }}
              onUrl={(value) => { beginEdit(); setSecondaryUrl(value); }}
              disabled={isBusy}
            />
          </>
        )}
        <div className="comparison-rail-actions">
          {result && !isDirty ? (
            <>
              <button type="button" className="comparison-new" onClick={clearResult} title="Start over"><RefreshCcw size={15} /><span>New</span></button>
              <a className="comparison-export" href={result.videoUrl} download={studioMode === "responsive" ? "responsive.mp4" : "comparison.mp4"}><Download size={15} /> Export MP4</a>
            </>
          ) : (
            <>
              {result && isDirty && <button type="button" className="comparison-new" onClick={clearResult} title="Reset preview" aria-label="Reset preview"><RefreshCcw size={15} /><span>Reset preview</span></button>}
              {result && isDirty && <a className="comparison-previous" href={result.videoUrl} download title="Download previous MP4" aria-label="Download previous MP4"><Download size={15} /><span>Previous MP4</span></a>}
              <button type="button" className="comparison-start" onClick={() => void start()} disabled={!canStart}>
                {isBusy ? <span className="loader-circle" /> : <Play size={15} fill="currentColor" />}
                {isBusy ? "Capturing…" : isDirty && result ? "Update capture" : studioMode === "responsive" ? "Capture device pair" : "Create comparison"}
              </button>
            </>
          )}
        </div>
      </div>

      {(primaryUrlError || (studioMode === "compare" && secondaryUrlError) || dimensionError) && <p className="comparison-validation"><AlertTriangle size={14} /> {primaryUrlError || secondaryUrlError || dimensionError}</p>}
      {!primaryUrl.trim() ? (
        <p className="comparison-hint">Enter {studioMode === "responsive" ? "a website URL" : "both website URLs"} to activate live previews and capture.</p>
      ) : studioMode === "compare" && !secondaryUrl.trim() ? (
        <p className="comparison-hint">Add the Version B URL to create the comparison.</p>
      ) : null}
      {result && isDirty && <p className="comparison-dirty"><RefreshCcw size={14} /> Settings changed. Your previous result is still available until you capture again.</p>}
      {error && <p className="workflow-error"><AlertTriangle size={15} /> {error}</p>}

      <div className="studio-layout comparison-workspace">
        <aside className="studio-controls comparison-settings" aria-label="Comparison settings">
          <section className="control-deck">
            <div className="control-deck-title"><span>Output quality</span><small>{studioMode === "responsive" ? "One combined device film" : "Shared export quality"}</small></div>
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
            <div className="control-deck-title"><span>{studioMode === "responsive" ? "Device pair" : "Shared viewport"}</span><small>{studioMode === "responsive" ? "Two explicit breakpoints" : width + " × " + height}</small></div>
            {studioMode === "responsive" ? (
              <div className="device-pair-list" role="radiogroup" aria-label="Responsive device pair">
                {DEVICE_PAIRS.map((pair) => (
                  <button type="button" role="radio" aria-checked={devicePairId === pair.id} key={pair.id} className={devicePairId === pair.id ? "is-active" : ""} onClick={() => { beginEdit(); setDevicePairId(pair.id); setDesktopSize([pair.desktop[0], pair.desktop[1]]); setMobileSize([pair.mobile[0], pair.mobile[1]]); }} disabled={isBusy}>
                    <span>{pair.id === "desktop-tablet" ? <Tablet size={16} /> : <><Monitor size={16} /><Smartphone size={14} /></>}</span>
                    <b>{pair.label}</b><small>{pair.detail}</small>
                  </button>
                ))}
                <div className="responsive-dimensions">
                  <span>Desktop <label><input type="number" min="320" max="3840" value={desktopWidth} onChange={(event) => { beginEdit(); setDevicePairId("custom"); setDesktopSize([Number(event.target.value), desktopHeight]); }} /> × <input type="number" min="240" max="2160" value={desktopHeight} onChange={(event) => { beginEdit(); setDevicePairId("custom"); setDesktopSize([desktopWidth, Number(event.target.value)]); }} /></label></span>
                  <span>{devicePair.mobileLabel} <label><input type="number" min="320" max="3840" value={mobileWidth} onChange={(event) => { beginEdit(); setDevicePairId("custom"); setMobileSize([Number(event.target.value), mobileHeight]); }} /> × <input type="number" min="240" max="2160" value={mobileHeight} onChange={(event) => { beginEdit(); setDevicePairId("custom"); setMobileSize([mobileWidth, Number(event.target.value)]); }} /></label></span>
                </div>
              </div>
            ) : (
              <div className="recorder-device-row comparison-device-grid" role="radiogroup" aria-label="Shared viewport">
                {DEVICE_PRESETS.map(({ value, label, Icon }) => (
                  <button type="button" role="radio" aria-checked={devicePreset === value} key={value} className={`recorder-device-btn${devicePreset === value ? " is-active" : ""}`} onClick={() => { beginEdit(); setDevicePreset(value); }} disabled={isBusy} title={value.replace("x", " × ")}>
                    <Icon size={15} /><span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {studioMode === "compare" && <details className="control-deck comparison-branding-deck" open>
            <summary><span>Labels & branding</span><small>Optional</small></summary>
            <div className="comparison-branding-body">
              <BrandingRow side="A" accent="blue" label={primaryLabel} logo={primaryLogo} logoDataUrl={primaryLogoDataUrl} disabled={isBusy} onLabel={(value) => { beginEdit(); setPrimaryLabel(value); }} onLogo={(value) => { beginEdit(); setPrimaryLogo(value); }} onLogoDataUrl={(value) => { beginEdit(); setPrimaryLogoDataUrl(value); }} />
              <BrandingRow side="B" accent="cyan" label={secondaryLabel} logo={secondaryLogo} logoDataUrl={secondaryLogoDataUrl} disabled={isBusy} onLabel={(value) => { beginEdit(); setSecondaryLabel(value); }} onLogo={(value) => { beginEdit(); setSecondaryLogo(value); }} onLogoDataUrl={(value) => { beginEdit(); setSecondaryLogoDataUrl(value); }} />
            </div>
          </details>}

          <section className="control-deck comparison-timing">
            <div className="control-deck-title"><span>Timeline</span><small>{syncMode === "independent" ? "Natural length" : durationSeconds + "s target"}</small></div>
            <div className="sync-mode-list" role="radiogroup" aria-label="Timeline synchronization">
              {SYNC_OPTIONS.map((option) => (
                <button type="button" role="radio" aria-checked={syncMode === option.value} key={option.value} className={syncMode === option.value ? "is-active" : ""} onClick={() => { beginEdit(); setSyncMode(option.value); }} disabled={isBusy}>
                  <span>{syncMode === option.value ? <Check size={13} /> : null}</span><b>{option.label}</b><small>{option.detail}</small>
                </button>
              ))}
            </div>
            {syncMode !== "independent" && <>
            <input type="range" min={8} max={45} value={durationSeconds} onChange={(event) => { beginEdit(); setDurationSeconds(Number(event.target.value)); }} disabled={isBusy} aria-label="Comparison duration" />
            <div className="comparison-duration-scale"><span>8s</span><span>45s</span></div>
            </>}
            <label className="quality-field-horizontal" style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Animation Curve</span>
              <select
                value={scrollCurvePreset}
                onChange={(e) => { beginEdit(); setScrollCurvePreset(e.target.value); }}
                disabled={isBusy}
                style={{ width: "100%" }}
              >
                <option value="linear">Linear</option>
                <option value="ease-in">Ease in</option>
                <option value="ease-out">Ease out</option>
                <option value="ease-in-out">Smooth</option>
                <option value="ease-in-cubic">In cubic</option>
                <option value="ease-out-cubic">Out cubic</option>
                <option value="ease-in-out-cubic">Smooth cubic</option>
              </select>
            </label>
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
                url={result.responsiveness ? `${result.responsiveness.desktopLabel} · ${result.responsiveness.mobileLabel}` : `${primaryLabel} · ${secondaryLabel}`}
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
              studioMode={studioMode}
              primaryLabel={primaryLabel || "Version A"}
              secondaryLabel={secondaryLabel || "Version B"}
              primaryLogo={primaryLogo || "A"}
              secondaryLogo={secondaryLogo || "B"}
              primaryLogoDataUrl={primaryLogoDataUrl}
              secondaryLogoDataUrl={secondaryLogoDataUrl}
              primaryUrl={primaryUrl}
              secondaryUrl={studioMode === "responsive" ? primaryUrl : secondaryUrl}
              job={activeJob}
              elapsed={elapsed}
              width={width}
              height={height}
              responsiveDesktop={{ width: desktopWidth, height: desktopHeight }}
              responsiveMobile={{ width: mobileWidth, height: mobileHeight, label: devicePair.mobileLabel }}
              durationSeconds={durationSeconds}
              scrollCurvePreset={scrollCurvePreset}
              scrollCurveBezier={scrollCurvePreset === "custom" ? scrollCurveBezier : undefined}
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
    if (!job.request) return;
    const comparison = job.request.comparison;
    const responsiveness = job.request.responsiveness;
    if (responsiveness) {
      setStudioMode("responsive");
      setPrimaryUrl(job.request.targetUrl);
      setSecondaryUrl(job.request.targetUrl);
      setPrimaryLabel(responsiveness.desktopLabel || "Desktop View");
      setSecondaryLabel(responsiveness.mobileLabel || "Mobile View");
      setPrimaryLogo("Desk");
      setSecondaryLogo("Mob");
      setSyncMode(responsiveness.syncMode || "match-speed");
      const matchingPair = DEVICE_PAIRS.find((pair) =>
        pair.desktop[0] === responsiveness.desktopWidth &&
        pair.desktop[1] === responsiveness.desktopHeight &&
        pair.mobile[0] === responsiveness.mobileWidth &&
        pair.mobile[1] === responsiveness.mobileHeight
      );
      if (matchingPair) setDevicePairId(matchingPair.id);
      else setDevicePairId("custom");
      setDesktopSize([responsiveness.desktopWidth || job.request.videoConfig.viewport.width, responsiveness.desktopHeight || job.request.videoConfig.viewport.height]);
      setMobileSize([responsiveness.mobileWidth || 390, responsiveness.mobileHeight || 844]);
    } else if (comparison) {
      setStudioMode("compare");
      setPrimaryUrl(job.request.targetUrl);
      setSecondaryUrl(comparison.targetUrl);
      setPrimaryLabel(comparison.primaryLabel);
      setSecondaryLabel(comparison.secondaryLabel);
      setPrimaryLogo(comparison.primaryLogo || "A");
      setSecondaryLogo(comparison.secondaryLogo || "B");
      setPrimaryLogoDataUrl(comparison.primaryLogoDataUrl);
      setSecondaryLogoDataUrl(comparison.secondaryLogoDataUrl);
      setSyncMode(comparison.syncMode || "match-speed");
    } else {
      return;
    }
    const viewport = job.request.videoConfig.viewport;
    const preset = `${viewport.width}x${viewport.height}`;
    if (DEVICE_PRESETS.some((item) => item.value === preset)) setDevicePreset(preset);
    const animConfig = job.request.animationConfig as any;
    setRenderTier(
      animConfig.fastMode === true
        ? "draft"
        : viewport.deviceScaleFactor === 2
          ? "cinematic"
          : "standard",
    );
    const duration = Number(animConfig.durationMs);
    if (duration) setDurationSeconds(Math.round(duration / 1_000));
    const curve = animConfig.scrollCurve;
    if (curve) {
      setScrollCurvePreset(curve.preset || "ease-in-out");
      if (curve.preset === "custom" && curve.customPoints) {
        setScrollCurveBezier([curve.customPoints.x1, curve.customPoints.y1, curve.customPoints.x2, curve.customPoints.y2]);
      }
    }
    setIsDirty(false);
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
      <span className="comparison-side">{props.side}</span>
      <div className="comparison-target-compact">
        <strong>{props.label || `Version ${props.side}`}</strong>
        <div className="url-input-wrap capture-url-wrap">
          <svg
            className="url-input-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <input
            type="url"
            className="url-input recorder-url-input"
            value={props.url}
            onChange={(event) => props.onUrl(event.target.value)}
            placeholder={`https://version-${props.side.toLowerCase()}.com`}
            aria-label={`Side ${props.side} URL`}
            disabled={props.disabled}
          />
        </div>
      </div>
    </div>
  );
}

function BrandingRow(props: {
  side: string;
  accent: "blue" | "cyan";
  label: string;
  logo: string;
  logoDataUrl?: string;
  disabled: boolean;
  onLabel: (value: string) => void;
  onLogo: (value: string) => void;
  onLogoDataUrl: (value: string | undefined) => void;
}) {
  return <div className="comparison-branding-row">
    <span className={`comparison-side is-${props.accent}`}>{props.side}</span>
    <label><span>Label</span><input value={props.label} maxLength={48} disabled={props.disabled} onChange={(event) => props.onLabel(event.target.value)} /></label>
    <div><span>Logo</span><LogoUpload side={props.side} accent={props.accent} logoText={props.logo} logoDataUrl={props.logoDataUrl} disabled={props.disabled} onLogoText={props.onLogo} onLogoDataUrl={props.onLogoDataUrl} /></div>
  </div>;
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
        <span className="comparison-logo-empty" style={{ borderColor: badgeColor }}>
          <Upload size={13} />
          <span><b>Upload logo</b><small>PNG, JPG, WebP or SVG</small></span>
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
  studioMode: "compare" | "responsive";
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
  responsiveDesktop: { width: number; height: number };
  responsiveMobile: { width: number; height: number; label: string };
  durationSeconds: number;
  scrollCurvePreset: string;
  scrollCurveBezier?: [number, number, number, number];
}) {
  const [primaryHeight, setPrimaryHeight] = useState<number | null>(null);
  const [secondaryHeight, setSecondaryHeight] = useState<number | null>(null);

  // When url or studioMode changes, we reset the detected heights so we recalculate
  useEffect(() => {
    setPrimaryHeight(null);
    setSecondaryHeight(null);
  }, [props.primaryUrl, props.secondaryUrl, props.studioMode]);

  const recording = props.job && ["queued", "running"].includes(props.job.status);
  // Compute live preview panel dimensions from explicit device choices.
  const dW = props.studioMode === "responsive" ? props.responsiveDesktop.width : props.width;
  const dH = props.studioMode === "responsive" ? props.responsiveDesktop.height : props.height;
  const mW = props.studioMode === "responsive" ? props.responsiveMobile.width : props.width;
  const mH = props.studioMode === "responsive" ? props.responsiveMobile.height : props.height;

  const maxH = Math.max(primaryHeight || 0, secondaryHeight || 0);
  const primaryDurationMs = primaryHeight && secondaryHeight && maxH > 0
    ? props.durationSeconds * 1000 * (primaryHeight / maxH)
    : props.durationSeconds * 1000;
  const secondaryDurationMs = primaryHeight && secondaryHeight && maxH > 0
    ? props.durationSeconds * 1000 * (secondaryHeight / maxH)
    : props.durationSeconds * 1000;

  const compactViewport = props.studioMode === "compare" && props.width <= 1024;
  const portraitViewport = props.studioMode === "compare" && props.height > props.width;
  const gridColumns = props.studioMode === "responsive"
    ? "minmax(0, 1.7fr) minmax(250px, 1fr)"
    : "repeat(2, minmax(0, 1fr))";

  return (
    <div className={`comparison-canvas${recording ? " is-recording" : ""}${compactViewport ? " is-compact-viewport" : ""}${portraitViewport ? " is-portrait-viewport" : ""}`} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="comparison-preview-labels" style={{ display: "grid", gridTemplateColumns: gridColumns, gap: "20px" }}>
        <span>
          {props.studioMode === "responsive" ? (
            <b>Desktop View <small>{dW} × {dH}</small></b>
          ) : (
            <>
              {props.primaryLogoDataUrl
                ? <i style={{ minWidth: "22px", width: "auto", padding: 0, background: "transparent" }}><img src={props.primaryLogoDataUrl} alt="" style={{ width: "22px", height: "22px", objectFit: "contain", borderRadius: "4px" }} /></i>
                : <i style={{ minWidth: "22px", width: "auto", paddingInline: "4px" }}>{props.primaryLogo}</i>}
              <b>{props.primaryLabel}</b>
            </>
          )}
        </span>
        <span>
          {props.studioMode === "responsive" ? (
            <b>{props.responsiveMobile.label} View <small>{mW} × {mH}</small></b>
          ) : (
            <>
              {props.secondaryLogoDataUrl
                ? <i style={{ minWidth: "22px", width: "auto", padding: 0, background: "transparent" }}><img src={props.secondaryLogoDataUrl} alt="" style={{ width: "22px", height: "22px", objectFit: "contain", borderRadius: "4px" }} /></i>
                : <i style={{ minWidth: "22px", width: "auto", paddingInline: "4px", background: "var(--accent-secondary)", color: "#071b18" }}>{props.secondaryLogo}</i>}
              <b>{props.secondaryLabel}</b>
            </>
          )}
        </span>
      </div>
      <div className="comparison-panels" style={{
        display: "grid",
        gridTemplateColumns: gridColumns,
        alignItems: "flex-start",
        gap: "20px"
      }}>
        <PreviewPanel
          url={props.primaryUrl}
          width={dW}
          height={dH}
          recording={Boolean(recording)}
          elapsed={props.elapsed}
          percent={props.job?.progress.percent ?? 0}
          status={props.job?.progress.message ?? ""}
          durationSeconds={props.durationSeconds}
          scrollCurvePreset={props.scrollCurvePreset}
          scrollCurveBezier={props.scrollCurveBezier}
          durationMs={primaryDurationMs}
          onScrollHeightDetected={setPrimaryHeight}
        />
        <PreviewPanel
          url={props.secondaryUrl}
          width={mW}
          height={mH}
          recording={Boolean(recording)}
          elapsed={props.elapsed}
          percent={props.job?.progress.percent ?? 0}
          status={props.job?.progress.message ?? ""}
          durationSeconds={props.durationSeconds}
          scrollCurvePreset={props.scrollCurvePreset}
          scrollCurveBezier={props.scrollCurveBezier}
          durationMs={secondaryDurationMs}
          onScrollHeightDetected={setSecondaryHeight}
        />
      </div>
      {recording && (
        <CapturePipeline
          percent={props.job?.progress.percent ?? 0}
          message={props.job?.progress.message ?? "Preparing capture"}
          elapsed={props.elapsed}
          labels={props.studioMode === "responsive" ? ["Desktop", props.responsiveMobile.label, "Compose"] : [props.primaryLabel, props.secondaryLabel, "Compose"]}
        />
      )}
    </div>
  );
}

function CapturePipeline({ percent, message, elapsed, labels }: { percent: number; message: string; elapsed: string; labels: string[] }) {
  const steps = [
    { label: labels[0], start: 2, done: 46 },
    { label: labels[1], start: 46, done: 91 },
    { label: labels[2], start: 91, done: 100 },
  ];
  return (
    <div className="comparison-capture-state" role="status" aria-live="polite">
      <div className="capture-steps">
        {steps.map((step, index) => {
          const complete = percent >= step.done;
          const active = percent >= step.start && !complete;
          return <div key={`${step.label}-${index}`} className={`${complete ? "is-complete" : ""}${active ? " is-active" : ""}`}><i>{complete ? <Check size={12} /> : index + 1}</i><span>{step.label}</span></div>;
        })}
      </div>
      <div className="capture-status-line"><span>{message}</span><small>{elapsed} · {Math.round(percent)}%</small></div>
      <div className="capture-progress-track"><i style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function PreviewPanel({
  url,
  width,
  height,
  recording,
  elapsed,
  percent,
  status,
  durationSeconds,
  scrollCurvePreset,
  scrollCurveBezier,
  durationMs,
  onScrollHeightDetected,
}: {
  url: string;
  width: number;
  height: number;
  recording: boolean;
  elapsed: string;
  percent: number;
  status: string;
  durationSeconds: number;
  scrollCurvePreset: string;
  scrollCurveBezier?: [number, number, number, number];
  durationMs: number;
  onScrollHeightDetected?: (height: number) => void;
}) {
  return (
    <div className="comparison-panel" style={{ aspectRatio: `${width} / ${height}` }}>
      <BrowserMockup
        url={url}
        videoUrl={null}
        duration={null}
        width={width}
        height={height}
        isSubmitting={recording}
        recordingElapsed={elapsed}
        recordingPercent={percent}
        recordingStatus={status}
        scrollCurvePreset={scrollCurvePreset}
        scrollCurveBezier={scrollCurveBezier}
        durationMs={durationMs}
        onScrollHeightDetected={onScrollHeightDetected}
      />
    </div>
  );
}

