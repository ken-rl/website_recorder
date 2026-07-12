import { Plus, Trash2 } from "lucide-react";
import React from "react";
import FieldLabel from "./FieldLabel";

export type PauseTriggerDraft = {
  id: string;
  selector: string;
  durationMs: number;
};

const DURATION_PRESETS = [
  { value: 1000, label: "1s" },
  { value: 1500, label: "1.5s" },
  { value: 2000, label: "2s" },
  { value: 3000, label: "3s" },
] as const;

export function createPauseTriggerDraft(
  partial?: Partial<Omit<PauseTriggerDraft, "id">>,
): PauseTriggerDraft {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    selector: partial?.selector ?? "",
    durationMs: partial?.durationMs ?? 1500,
  };
}

/** Strip empty rows and clamp duration for the record API. */
export function toPauseTriggersPayload(
  drafts: PauseTriggerDraft[],
): Array<{ selector: string; durationMs: number }> {
  return drafts
    .map((d) => ({
      selector: d.selector.trim(),
      durationMs: Math.max(100, Math.min(30000, Math.round(d.durationMs) || 1500)),
    }))
    .filter((d) => d.selector.length > 0);
}

interface PauseTriggersFormProps {
  triggers: PauseTriggerDraft[];
  setTriggers: (next: PauseTriggerDraft[]) => void;
  disabled?: boolean;
}

export default function PauseTriggersForm({
  triggers,
  setTriggers,
  disabled = false,
}: PauseTriggersFormProps) {
  const updateRow = (id: string, patch: Partial<PauseTriggerDraft>) => {
    setTriggers(
      triggers.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const removeRow = (id: string) => {
    setTriggers(triggers.filter((row) => row.id !== id));
  };

  const addRow = () => {
    setTriggers([...triggers, createPauseTriggerDraft()]);
  };

  const filledCount = triggers.filter((t) => t.selector.trim()).length;

  return (
    <section
      className={`pause-triggers-form motion-block${disabled ? " is-disabled" : ""}`}
    >
      <div className="motion-block-head">
        <h4 className="motion-block-title">
          <FieldLabel
            hint="Hold when a CSS selector first enters the viewport (document scroll only). Each selector fires once."
          >
            Pause triggers
          </FieldLabel>
        </h4>
        {triggers.length > 0 && (
          <button
            type="button"
            className="motion-text-btn"
            onClick={addRow}
            disabled={disabled || triggers.length >= 8}
          >
            <Plus size={13} strokeWidth={2.2} aria-hidden />
            Add
          </button>
        )}
      </div>

      {triggers.length === 0 ? (
        <button
          type="button"
          className="pause-triggers-empty-btn"
          onClick={addRow}
          disabled={disabled}
        >
          <Plus size={14} strokeWidth={2.2} aria-hidden />
          <span>
            Add a hold
            <small>e.g. footer, #pricing</small>
          </span>
        </button>
      ) : (
        <ul className="pause-triggers-list" aria-label="Pause triggers">
          {triggers.map((row, index) => (
            <li key={row.id} className="pause-trigger-row">
              <input
                id={`pause-sel-${row.id}`}
                type="text"
                className="pause-trigger-selector"
                placeholder="CSS selector"
                value={row.selector}
                spellCheck={false}
                autoComplete="off"
                disabled={disabled}
                aria-label={`Pause selector ${index + 1}`}
                onChange={(e) => updateRow(row.id, { selector: e.target.value })}
              />
              <div
                className="pause-trigger-duration-options"
                role="radiogroup"
                aria-label={`Hold duration ${index + 1}`}
              >
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    role="radio"
                    aria-checked={row.durationMs === preset.value}
                    className={
                      row.durationMs === preset.value ? "is-active" : undefined
                    }
                    disabled={disabled}
                    onClick={() =>
                      updateRow(row.id, { durationMs: preset.value })
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="pause-trigger-remove"
                aria-label={`Remove pause ${index + 1}`}
                title="Remove"
                disabled={disabled}
                onClick={() => removeRow(row.id)}
              >
                <Trash2 size={13} strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {filledCount > 0 && (
        <p className="motion-footnote">
          {filledCount} active · document scroll only
        </p>
      )}
    </section>
  );
}
