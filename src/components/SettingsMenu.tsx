import { useEffect, useId, useRef, useState } from "react";
import { QUESTION_KINDS, type QuestionKind } from "../lib/exercise";

export interface Settings {
  plies: number;
  kinds: QuestionKind[];
}

export const settingsKey = (s: Settings) => `${s.plies}:${[...s.kinds].sort().join(",")}`;

const PLY_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

interface SettingsMenuProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  /** True when the current exercise was made with different settings. */
  pending: boolean;
  /** Replace the current exercise with one using the current settings. */
  onApplyNow: () => void;
  onResetStats: () => void;
}

/**
 * A gear button that opens a dropdown panel. Changes save immediately but only
 * shape the next exercise, so editing settings never yanks away the current one.
 */
export function SettingsMenu({ settings, onChange, pending, onApplyNow, onResetStats }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setConfirmReset(false);
  }, [open]);

  const toggleKind = (kind: QuestionKind) => {
    const on = settings.kinds.includes(kind);
    onChange({ ...settings, kinds: on ? settings.kinds.filter((k) => k !== kind) : [...settings.kinds, kind] });
  };

  return (
    <div className="menu" ref={rootRef}>
      <button
        ref={buttonRef}
        className={`menu__trigger${open ? " is-open" : ""}`}
        aria-label="Settings"
        title="Settings"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"
          />
          <circle cx="16" cy="6" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="10" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="18" cy="18" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>

      {open && (
        <div className="menu__panel" id={panelId} role="dialog" aria-label="Settings">
          <div className="menu__section">
            <span className="field__label" id={`${panelId}-length`}>
              Sequence length <span className="field__hint">(half-moves)</span>
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby={`${panelId}-length`}>
              {PLY_OPTIONS.map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={settings.plies === n}
                  className={settings.plies === n ? "is-active" : ""}
                  onClick={() => onChange({ ...settings, plies: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="menu__section">
            <span className="field__label">Question types</span>
            <div className="chips">
              {QUESTION_KINDS.map(({ kind, label }) => {
                const on = settings.kinds.includes(kind);
                const last = on && settings.kinds.length === 1;
                return (
                  <button
                    key={kind}
                    className={`chip${on ? " is-active" : ""}`}
                    aria-pressed={on}
                    disabled={last}
                    title={last ? "At least one question type is needed" : undefined}
                    onClick={() => toggleKind(kind)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="menu__apply">
            <span>Changes apply from the next exercise.</span>
            {pending && (
              <button
                className="button button--small"
                onClick={() => {
                  onApplyNow();
                  setOpen(false);
                }}
              >
                New exercise now
              </button>
            )}
          </div>

          <div className="menu__footer">
            {confirmReset ? (
              <>
                <span>Reset your score and streaks?</span>
                <span className="menu__footer-actions">
                  <button className="ghost-button" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </button>
                  <button
                    className="ghost-button ghost-button--danger"
                    onClick={() => {
                      onResetStats();
                      setConfirmReset(false);
                    }}
                  >
                    Reset
                  </button>
                </span>
              </>
            ) : (
              <button className="ghost-button" onClick={() => setConfirmReset(true)}>
                Reset score
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
