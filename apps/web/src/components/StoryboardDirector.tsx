import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Maximize2,
  MousePointerClick,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { DirectorBeat, WebsiteInspection } from "../lib/productTypes";

interface StoryboardDirectorProps {
  inspection: WebsiteInspection;
  beats: DirectorBeat[];
  setBeats: (beats: DirectorBeat[]) => void;
  startHoldMs: number;
  setStartHoldMs: (value: number) => void;
  defaultCurve: string;
}

const OPENING_ID = "opening-frame";

const CURVE_OPTIONS = [
  { value: "ease-in-out", label: "Smooth" },
  { value: "linear", label: "Linear" },
  { value: "ease-out-cubic", label: "Gentle arrival" },
  { value: "ease-in-cubic", label: "Gentle departure" },
  { value: "custom", label: "Custom curve" },
];

export default function StoryboardDirector({
  inspection,
  beats,
  setBeats,
  startHoldMs,
  setStartHoldMs,
  defaultCurve,
}: StoryboardDirectorProps) {
  const [selectedSceneId, setSelectedSceneId] = useState(beats[0]?.id ?? OPENING_ID);
  const [preview, setPreview] = useState<{ image: string; label: string } | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const totalMs = startHoldMs + beats.reduce((sum, beat) => sum + beat.transitionMs + beat.holdMs, 0);
  const minimumMs = startHoldMs + beats.reduce((sum, beat) => sum + beat.holdMs + 250, 0);
  const minimumSeconds = Math.max(1, Math.ceil(minimumMs / 1000));
  const maximumSeconds = Math.min(
    300,
    Math.max(30, minimumSeconds + 10, Math.ceil((totalMs / 1000) * 2)),
  );
  const selectedBeat = beats.find((beat) => beat.id === selectedSceneId) ?? null;
  const selectedSelectors = new Set(
    beats.flatMap((beat) => beat.target.type === "selector" ? [beat.target.selector] : []),
  );

  useEffect(() => {
    if (selectedSceneId === OPENING_ID || beats.some((beat) => beat.id === selectedSceneId)) return;
    setSelectedSceneId(beats[0]?.id ?? OPENING_ID);
  }, [beats, selectedSceneId]);

  useEffect(() => {
    if (!preview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [preview]);

  const openingImage = inspection.screenshots[inspection.storyboard[0]?.imageIndex ?? 0];
  const sceneImages = useMemo(() => new Map(
    beats.map((beat) => [beat.id, findSceneImage(inspection, beat)]),
  ), [beats, inspection]);
  const openPreview = (image: string | undefined, label: string) => {
    if (!image) return;
    setPreviewZoom(1);
    setPreview({ image, label });
  };

  const updateBeat = (id: string, patch: Partial<DirectorBeat>) => {
    setBeats(beats.map((beat) => beat.id === id ? { ...beat, ...patch } : beat));
  };

  const removeBeat = (id: string) => {
    const index = beats.findIndex((beat) => beat.id === id);
    const next = beats.filter((beat) => beat.id !== id);
    setBeats(next);
    setSelectedSceneId(next[Math.min(index, next.length - 1)]?.id ?? OPENING_ID);
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
    setSelectedSceneId(next.id);
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
    <section className="director route-director" aria-label="Capture route builder">
      <div className="route-director-heading">
        <div className="analysis-ready-mark"><CheckCircle2 size={17} /><span>Analysis ready</span></div>
        <div className="route-page-title">
          <h2>{inspection.title || new URL(inspection.url).hostname}</h2>
          <p>{beats.length} scenes selected · {Math.round(inspection.pageHeight).toLocaleString()}px page · {inspection.scrollMode} scroll</p>
        </div>
        <label className="route-total-time">
          <Clock3 size={15} />
          <span>Total time</span>
          <input type="number" min={minimumSeconds} max={300} step={0.5} value={(totalMs / 1000).toFixed(1)} onChange={(event) => setTargetDuration(Number(event.target.value))} />
          <small>sec</small>
        </label>
      </div>

      <div className="route-overview">
        <div className="route-section-heading">
          <div><span>Capture route</span><p>Click a scene to adjust it. The recording moves from left to right.</p></div>
          <span className="route-help"><MousePointerClick size={13} /> Select a scene</span>
        </div>

        <label className="route-duration-control">
          <span>{minimumSeconds}s</span>
          <input type="range" min={minimumSeconds} max={maximumSeconds} step={0.5} value={Math.max(minimumSeconds, Math.min(maximumSeconds, totalMs / 1000))} onChange={(event) => setTargetDuration(Number(event.target.value))} aria-label="Total capture duration" />
          <span>{maximumSeconds}s</span>
        </label>

        <div className="capture-route" role="list" aria-label="Selected capture scenes">
          <SceneCard
            image={openingImage}
            label="Opening frame"
            meta={`${formatSeconds(startHoldMs)} hold`}
            index="Start"
            selected={selectedSceneId === OPENING_ID}
            onSelect={() => setSelectedSceneId(OPENING_ID)}
            onPreview={() => openPreview(openingImage, "Opening frame")}
          />
          {beats.map((beat, index) => (
            <React.Fragment key={beat.id}>
              <span className="route-connector" aria-hidden><ArrowRight size={15} /></span>
              <SceneCard
                image={sceneImages.get(beat.id)}
                label={beat.label}
                meta={`${formatSeconds(beat.transitionMs)} move · ${formatSeconds(beat.holdMs)} hold`}
                index={`Scene ${index + 1}`}
                selected={selectedSceneId === beat.id}
                onSelect={() => setSelectedSceneId(beat.id)}
                onPreview={() => openPreview(sceneImages.get(beat.id), beat.label)}
              />
            </React.Fragment>
          ))}
          {beats.length === 0 && <div className="route-empty">Add a detected section below to create the route.</div>}
        </div>
      </div>

      <div className="route-workbench">
        <section className="scene-inspector" aria-label="Selected scene settings">
          <div className="scene-inspector-heading">
            <div>
              <span className="scene-kicker">{selectedBeat ? `Scene ${beats.indexOf(selectedBeat) + 1}` : "Start"}</span>
              <h3>{selectedBeat?.label ?? "Opening frame"}</h3>
              <p>{selectedBeat ? `${Math.round(selectedBeat.progress * 100)}% down the page` : "The first thing viewers see"}</p>
            </div>
            {selectedBeat && <button type="button" className="remove-scene" onClick={() => removeBeat(selectedBeat.id)}><Trash2 size={14} /> Remove</button>}
          </div>

          {!selectedBeat ? (
            <SceneTimeControl
              label="Opening hold"
              description="Give the hero a moment before scrolling starts."
              valueMs={startHoldMs}
              min={0}
              max={5_000}
              step={250}
              onChange={setStartHoldMs}
            />
          ) : (
            <div className="scene-control-grid">
              <SceneTimeControl
                label="Travel time"
                description="How long it takes to reach this scene."
                valueMs={selectedBeat.transitionMs}
                min={250}
                max={20_000}
                step={250}
                onChange={(value) => updateBeat(selectedBeat.id, { transitionMs: value })}
              />
              <SceneTimeControl
                label="Pause here"
                description="How long the camera rests on this scene."
                valueMs={selectedBeat.holdMs}
                min={0}
                max={8_000}
                step={250}
                onChange={(value) => updateBeat(selectedBeat.id, { holdMs: value })}
              />
              <label className="scene-curve-control">
                <span><strong>Motion feel</strong><small>Easing used while moving here.</small></span>
                <select value={selectedBeat.curve} onChange={(event) => updateBeat(selectedBeat.id, { curve: event.target.value })}>
                  {CURVE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          )}
        </section>

        {inspection.scrollMode === "document" && inspection.sections.length > 0 && (
          <aside className="scene-picker">
            <div className="scene-picker-heading">
              <div><span>Add scenes</span><p>Highlights found during analysis</p></div>
              <SlidersHorizontal size={15} />
            </div>
            <div className="scene-picker-list">
              {inspection.sections.map((section) => {
                const selected = selectedSelectors.has(section.selector);
                return (
                  <button type="button" key={section.selector} className={selected ? "is-selected" : ""} disabled={selected || beats.length >= 12} onClick={() => addSection(section)}>
                    <span><strong>{section.label}</strong><small>{Math.round(section.progress * 100)}% down page</small></span>
                    {selected ? <Check size={14} /> : <Plus size={14} />}
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>

      {inspection.warnings.length > 0 && (
        <div className="inspection-warnings route-warnings">
          {inspection.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      )}

      {preview && createPortal(
        <div className="scene-preview-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPreview(null);
        }}>
          <section className="scene-preview-dialog" role="dialog" aria-modal="true" aria-label={`${preview.label} preview`}>
            <div className="scene-preview-toolbar">
              <div><span>Scene preview</span><strong>{preview.label}</strong></div>
              <div className="scene-preview-actions">
                <button type="button" onClick={() => setPreviewZoom((zoom) => Math.max(0.75, zoom - 0.25))} aria-label="Zoom out"><ZoomOut size={16} /></button>
                <output>{Math.round(previewZoom * 100)}%</output>
                <button type="button" onClick={() => setPreviewZoom((zoom) => Math.min(2.5, zoom + 0.25))} aria-label="Zoom in"><ZoomIn size={16} /></button>
                <button type="button" className="scene-preview-close" onClick={() => setPreview(null)} aria-label="Close preview"><X size={17} /></button>
              </div>
            </div>
            <div className="scene-preview-canvas">
              <img
                src={`data:image/jpeg;base64,${preview.image}`}
                alt={`${preview.label} analyzed scene`}
                style={{ width: `${previewZoom * 100}%` }}
              />
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}

function SceneCard({ image, label, meta, index, selected, onSelect, onPreview }: {
  image?: string;
  label: string;
  meta: string;
  index: string;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  return (
    <article role="listitem" className={`route-scene-card${selected ? " is-selected" : ""}`}>
      <button type="button" className="route-scene-select" onClick={onSelect} aria-pressed={selected}>
        <span className="route-scene-image">
          {image ? <img src={`data:image/jpeg;base64,${image}`} alt="" /> : <span className="route-scene-fallback" />}
          <small>{index}</small>
          {selected && <i><Check size={12} /></i>}
        </span>
        <span className="route-scene-copy"><strong title={label}>{label}</strong><small>{meta}</small></span>
      </button>
      {image && <button type="button" className="route-scene-expand" onClick={onPreview} aria-label={`Enlarge ${label} preview`}><Maximize2 size={14} /></button>}
    </article>
  );
}

function SceneTimeControl({ label, description, valueMs, min, max, step, onChange }: {
  label: string;
  description: string;
  valueMs: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="scene-time-control">
      <span><strong>{label}</strong><small>{description}</small></span>
      <div>
        <input type="range" min={min} max={max} step={step} value={Math.max(min, Math.min(max, valueMs))} onChange={(event) => onChange(Number(event.target.value))} />
        <output>{formatSeconds(valueMs)}</output>
      </div>
    </label>
  );
}

function findSceneImage(inspection: WebsiteInspection, beat: DirectorBeat) {
  if (beat.imageIndex !== undefined) return inspection.screenshots[beat.imageIndex];
  if (beat.target.type === "selector") {
    const selector = beat.target.selector;
    const section = inspection.sections.find(
      (candidate) => candidate.selector === selector,
    );
    if (section?.imageIndex !== undefined) {
      return inspection.screenshots[section.imageIndex];
    }
  }
  const closest = inspection.storyboard.reduce<typeof inspection.storyboard[number] | undefined>((best, frame) => {
    if (!best) return frame;
    return Math.abs(frame.target.value - beat.progress) < Math.abs(best.target.value - beat.progress) ? frame : best;
  }, undefined);
  return closest ? inspection.screenshots[closest.imageIndex] : undefined;
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}
