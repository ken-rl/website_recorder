import React, { useCallback, useEffect, useState } from "react";
import { Copy, Download, Film, Play, RefreshCcw, Trash2 } from "lucide-react";
import type { RecordingJob } from "../lib/productTypes";

interface RecordingLibraryProps {
  onOpen: (job: RecordingJob) => void;
  onDuplicate: (job: RecordingJob) => void;
}

export default function RecordingLibrary({ onOpen, onDuplicate }: RecordingLibraryProps) {
  const [jobs, setJobs] = useState<RecordingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/jobs");
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load recordings");
      setJobs(data.jobs);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load recordings");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!jobs.some((job) => job.status === "queued" || job.status === "running")) return;
    const timer = window.setTimeout(() => void load(true), 1_500);
    return () => window.clearTimeout(timer);
  }, [jobs, load]);

  const retry = async (job: RecordingJob) => {
    const response = await fetch(`/api/jobs/${job.jobId}/retry`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Could not retry recording");
    await load();
  };

  const remove = async (job: RecordingJob) => {
    if (!window.confirm(`Delete ${displayHost(job.targetUrl, job.jobId)} and its video files?`)) return;
    const response = await fetch(`/api/jobs/${job.jobId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Could not delete recording");
    await load();
  };

  return (
    <section className="library-page">
      <header className="library-header">
        <div><span className="eyebrow">Local archive</span><h1>Recording library</h1><p>Every capture, recoverable and ready to reuse.</p></div>
        <button type="button" className="quiet-button" onClick={() => void load(false)}><RefreshCcw size={15} /> Refresh</button>
      </header>
      {error && <p className="workflow-error">{error}</p>}
      {loading ? (
        <div className="library-empty"><span className="loader-circle" /> Loading the archive…</div>
      ) : jobs.length === 0 ? (
        <div className="library-empty"><Film size={28} /><strong>No recordings yet</strong><span>Your first completed capture will appear here.</span></div>
      ) : (
        <div className="library-grid">
          {jobs.map((job) => (
            <article className={`recording-card is-${job.status}`} key={job.jobId}>
              <button type="button" className="recording-poster" onClick={() => job.result && onOpen(job)} disabled={!job.result}>
                {job.result?.thumbnailUrl ? <img src={job.result.thumbnailUrl} alt="" /> : <div className="poster-fallback"><Film size={24} /><span>{job.progress.percent}%</span></div>}
                {job.status === "completed" && <span className="poster-play"><Play size={15} fill="currentColor" /></span>}
                <span className={`job-status status-${job.status}`}>{job.status}</span>
              </button>
              <div className="recording-card-body">
                <div className="recording-title"><strong>{job.title || displayHost(job.targetUrl, job.jobId)}</strong><small>{new Date(job.createdAt).toLocaleString()}</small></div>
                <p>{job.status === "failed" || job.status === "interrupted" ? job.error?.message : job.progress.message}</p>
                {job.result && <div className="recording-facts"><span>{formatDuration(job.result.durationMs)}</span><span>{job.result.viewport.width}×{job.result.viewport.height}</span><span>{formatBytes(job.result.sizeBytes)}</span></div>}
                <div className="recording-actions">
                  {job.result && <button type="button" onClick={() => onOpen(job)}><Play size={14} /> Open</button>}
                  {job.result && <a href={job.result.videoUrl} download="recording.mp4"><Download size={14} /> MP4</a>}
                  {job.request && <button type="button" onClick={() => onDuplicate(job)}><Copy size={14} /> Duplicate</button>}
                  {["failed", "cancelled", "interrupted"].includes(job.status) && job.request && <button type="button" onClick={() => void retry(job)}><RefreshCcw size={14} /> Retry</button>}
                  <button type="button" className="danger-action" onClick={() => void remove(job)} disabled={job.status === "queued" || job.status === "running"}><Trash2 size={14} /><span className="sr-only">Delete</span></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function displayHost(url: string, fallback: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return fallback.split("-202")[0]; }
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
}
