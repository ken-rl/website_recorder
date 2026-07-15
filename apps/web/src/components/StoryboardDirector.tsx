import React from "react";
import { Clock3, Image, Plus, Trash2 } from "lucide-react";
import type { DirectorBeat, WebsiteInspection } from "../lib/productTypes";

interface StoryboardDirectorProps {
  inspection: WebsiteInspection;
  beats: DirectorBeat[];
  setBeats: (beats: DirectorBeat[]) => void;
  startHoldMs: number;
  setStartHoldMs: (value: number) => void;
  defaultCurve: string;
}

export default function StoryboardDirector({
  inspection,
  beats,
  setBeats,
  startHoldMs,
  setStartHoldMs,
  defaultCurve,
}: StoryboardDirectorProps) {
  const totalMs = startHoldMs + beats.reduce((sum, beat) => sum + beat.transitionMs + beat.holdMs, 0);
  const minimumMs = startHoldMs + beats.reduce((sum, beat) => sum + beat.holdMs + 250, 0);
  const maximumMs = Math.min(300_000, startHoldMs + beats.reduce((sum, beat) => sum + beat.holdMs + 60_000, 0));
  const selectedSelectors = new Set(
    beats.flatMap((beat) => beat.target.type === "selector" ? [beat.target.selector] : []),
  );

  const updateBeat = (id: string, patch: Partial<DirectorBeat>) => {
    setBeats(beats.map((beat) => beat.id === id ? { ...beat, ...patch } : beat));
  };

  const addSection = (section: WebsiteInspection["sections"][number]) => {
    const replacementIndex = beats.findIndex(
      (beat) => beat.target.type === "progress" && Math.abs(beat.progress - section.progress) < 0.09,
    );
    const next: DirectorBeat = {
      id: crypto.randomUUID(),
      label: section.label,
      target: section.recommendedTarget,
      progress: section.progress,
      transitionMs: section.recommendedTransitionMs,
      holdMs: 1000,
      curve: defaultCurve,
    };
    const updated = replacementIndex >= 0
      ? beats.map((beat, index) => index === replacementIndex ? next : beat)
      : [...beats, next];
    setBeats(updated.sort((a, b) => a.progress - b.progress));
  };

  const setTargetDuration = (seconds: number) => {
    const targetMs = Math.max(1_000, Math.min(300_000, Math.round(seconds * 1000)));
    const fixed = startHoldMs + beats.reduce((sum, beat) => sum + beat.holdMs, 0);
    const available = targetMs - fixed;
    if (available < beats.length * 250) return;
    const currentMovement = beats.reduce((sum, beat) => sum + beat.transitionMs, 0) || beats.length;
    let assigned = 0;
    setBeats(beats.map((beat, index) => {
      const transitionMs = index === beats.length - 1
        ? Math.max(250, available - assigned)
        : Math.max(250, Math.round((available * beat.transitionMs) / currentMovement / 50) * 50);
      assigned += transitionMs;
      return { ...beat, transitionMs: Math.min(60_000, transitionMs) };
    }));
  };

  return (
    <section className="director" aria-label="Storyboard director">
      <div className="director-heading">
        <div>
          <span className="eyebrow">Motion director</span>
          <h2>{inspection.title || new URL(inspection.url).hostname}</h2>
          <p>{inspection.scrollMode === "virtual" ? "Virtual storyboard" : `${inspection.sections.length} sections detected`} · {Math.round(inspection.pageHeight).toLocaleString()}px page</p>
        </div>
        <label className="duration-control">
          <Clock3 size={15} />
          <span>Total</span>
          <input
            type="number"
            min={1}
            max={300}
            step={0.5}
            value={(totalMs / 1000).toFixed(1)}
            onChange={(event) => setTargetDuration(Number(event.target.value))}
          />
          <small>sec</small>
        </label>
      </div>

      {inspection.warnings.length > 0 && (
        <div className="inspection-warnings">
          {inspection.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      )}

      <label className="director-duration-slider">
        <span>{Math.max(1, Math.ceil(minimumMs / 1000))}s</span>
        <input
          type="range"
          min={Math.max(1, Math.ceil(minimumMs / 1000))}
          max={Math.max(1, Math.floor(maximumMs / 1000))}
          step={0.5}
          value={Math.max(minimumMs / 1000, Math.min(maximumMs / 1000, totalMs / 1000))}
          onChange={(event) => setTargetDuration(Number(event.target.value))}
          aria-label="Total storyboard duration"
        />
        <span>{Math.max(1, Math.floor(maximumMs / 1000))}s</span>
      </label>

      <div className="storyboard-strip">
        {inspection.storyboard.map((frame, index) => (
          <figure key={`${frame.target.value}-${index}`}>
            <img src={`data:image/jpeg;base64,${inspection.screenshots[frame.imageIndex]}`} alt={`Page at ${Math.round(frame.target.value * 100)}%`} />
            <figcaption>{Math.round(frame.target.value * 100)}%</figcaption>
          </figure>
        ))}
      </div>

      <div className="director-grid">
        <div className="beat-column">
          <div className="beat-row beat-row--hero">
            <span className="beat-index">00</span>
            <div className="beat-name"><strong>Opening frame</strong><small>Hero hold</small></div>
            <label><span>Hold</span><input type="number" min={0} max={15} step={0.5} value={startHoldMs / 1000} onChange={(event) => setStartHoldMs(Math.round(Number(event.target.value) * 1000))} /><small>s</small></label>
          </div>
          {beats.map((beat, index) => (
            <div className="beat-row" key={beat.id}>
              <span className="beat-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="beat-name"><strong title={beat.label}>{beat.label}</strong><small>{Math.round(beat.progress * 100)}% down page</small></div>
              <label><span>Move</span><input type="number" min={0.25} max={60} step={0.25} value={beat.transitionMs / 1000} onChange={(event) => updateBeat(beat.id, { transitionMs: Math.round(Number(event.target.value) * 1000) })} /><small>s</small></label>
              <label><span>Hold</span><input type="number" min={0} max={15} step={0.5} value={beat.holdMs / 1000} onChange={(event) => updateBeat(beat.id, { holdMs: Math.round(Number(event.target.value) * 1000) })} /><small>s</small></label>
              <select value={beat.curve} onChange={(event) => updateBeat(beat.id, { curve: event.target.value })} aria-label={`Easing for ${beat.label}`}>
                <option value="ease-in-out">Smooth</option>
                <option value="linear">Linear</option>
                <option value="ease-out-cubic">Ease out</option>
                <option value="ease-in-cubic">Ease in</option>
                <option value="custom">Custom</option>
              </select>
              <button type="button" className="icon-button" onClick={() => setBeats(beats.filter((item) => item.id !== beat.id))} aria-label={`Remove ${beat.label}`}><Trash2 size={14} /></button>
            </div>
          ))}
          {beats.length === 0 && <div className="empty-beats"><Image size={18} /> Add at least one destination to direct the capture.</div>}
        </div>

        {inspection.scrollMode === "document" && inspection.sections.length > 0 && (
          <aside className="section-bank">
            <div className="section-bank-head"><span>Detected scenes</span><small>Choose highlights</small></div>
            <div className="section-bank-list">
              {inspection.sections.map((section) => {
                const selected = selectedSelectors.has(section.selector);
                return (
                  <button type="button" key={section.selector} disabled={selected || beats.length >= 12} onClick={() => addSection(section)}>
                    <span><strong>{section.label}</strong><small>{Math.round(section.progress * 100)}% · {section.kind}</small></span>
                    <Plus size={14} />
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
