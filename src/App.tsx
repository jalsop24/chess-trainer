import { useCallback, useEffect, useRef, useState } from "react";
import type { Color, Square } from "chess.js";
import { Board } from "./components/Board";
import { AnswerInput, formatAnswer, type AnswerValue } from "./components/AnswerInput";
import {
  QUESTION_KINDS,
  moveRows,
  generateExercise,
  type Exercise,
  type Puzzle,
  type QuestionKind,
} from "./lib/exercise";

interface Settings {
  plies: number;
  kinds: QuestionKind[];
}

interface Stats {
  answered: number;
  correct: number;
  streak: number;
  best: number;
}

const DEFAULT_SETTINGS: Settings = { plies: 4, kinds: QUESTION_KINDS.map((q) => q.kind) };
const EMPTY_STATS: Stats = { answered: 0, correct: 0, streak: 0, best: 0 };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode etc.); settings just won't persist.
  }
}

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "asking"; exercise: Exercise }
  | { name: "revealed"; exercise: Exercise; given: AnswerValue; correct: boolean };

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = load("settings", DEFAULT_SETTINGS);
    // Drop question kinds saved by older versions that no longer exist.
    const kinds = saved.kinds.filter((k) => QUESTION_KINDS.some((q) => q.kind === k));
    return { ...saved, kinds: kinds.length > 0 ? kinds : DEFAULT_SETTINGS.kinds };
  });
  const [stats, setStats] = useState<Stats>(() => load("stats", EMPTY_STATS));
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [step, setStep] = useState(0);

  const puzzlesRef = useRef<Puzzle[] | null>(null);

  useEffect(() => save("settings", settings), [settings]);
  useEffect(() => save("stats", stats), [stats]);

  const nextExercise = useCallback((s: Settings) => {
    const puzzles = puzzlesRef.current;
    if (!puzzles) return;
    try {
      setPhase({ name: "asking", exercise: generateExercise({ puzzles, plies: s.plies, kinds: s.kinds }) });
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}puzzles.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Couldn't load puzzles (HTTP ${res.status})`);
        return res.json() as Promise<Puzzle[]>;
      })
      .then((puzzles) => {
        if (cancelled) return;
        puzzlesRef.current = puzzles;
        nextExercise(settings);
      })
      .catch((err) => {
        if (!cancelled) setPhase({ name: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
    // Only on mount; settings changes trigger their own regeneration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    if (s.kinds.length > 0 && phase.name !== "revealed") nextExercise(s);
  };

  const submit = (given: AnswerValue) => {
    if (phase.name !== "asking") return;
    const correct = given === phase.exercise.question.answer;
    setPhase({ name: "revealed", exercise: phase.exercise, given, correct });
    setStep(phase.exercise.moves.length);
    setStats((st) => {
      const streak = correct ? st.streak + 1 : 0;
      return {
        answered: st.answered + 1,
        correct: st.correct + (correct ? 1 : 0),
        streak,
        best: Math.max(st.best, streak),
      };
    });
  };

  // Keyboard: arrows step through the line after revealing, Enter moves on.
  useEffect(() => {
    if (phase.name !== "revealed") return;
    const total = phase.exercise.moves.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
      else if (e.key === "ArrowRight") setStep((s) => Math.min(total, s + 1));
      // A focused button handles Enter itself; don't advance twice.
      else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) nextExercise(settings);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, settings, nextExercise]);

  const exercise = phase.name === "asking" || phase.name === "revealed" ? phase.exercise : null;
  const orientation: Color = exercise?.orientation ?? "w";
  const toMove: Color = exercise?.startFen.split(" ")[1] === "b" ? "b" : "w";

  let boardFen = exercise?.startFen ?? "8/8/8/8/8/8/8/8 w - - 0 1";
  let highlight: Square[] = [];
  if (exercise && phase.name === "revealed" && step > 0) {
    const m = exercise.moves[step - 1];
    boardFen = m.fenAfter;
    highlight = [m.from, m.to];
  }

  const total = exercise?.moves.length ?? 0;
  const revealed = phase.name === "revealed";

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <BrandMark />
          <h1>Visualisation Trainer</h1>
        </div>
        <dl className="stats" aria-label="Score">
          <div>
            <dt>Correct</dt>
            <dd>
              {stats.correct}
              <span className="stats__of">/{stats.answered}</span>
            </dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd>{stats.streak}</dd>
          </div>
          <div>
            <dt>Best</dt>
            <dd>{stats.best}</dd>
          </div>
          <button className="ghost-button" onClick={() => setStats(EMPTY_STATS)} title="Reset score">
            Reset
          </button>
        </dl>
      </header>

      <main className="layout">
        <section className="board-area">
          <div className={`board-frame${phase.name === "loading" ? " board-frame--loading" : ""}`}>
            <Board fen={boardFen} orientation={orientation} highlight={highlight} />
            {phase.name === "loading" && <div className="overlay">Loading puzzles…</div>}
          </div>
          <div className="board-footer">
            {revealed ? (
              <div className="stepper" role="group" aria-label="Replay the line">
                <IconButton label="Start position" disabled={step === 0} onClick={() => setStep(0)} icon="first" />
                <IconButton label="Previous move" disabled={step === 0} onClick={() => setStep((s) => s - 1)} icon="prev" />
                <span className="stepper__label">{step === 0 ? "Start position" : `Move ${step} of ${total}`}</span>
                <IconButton label="Next move" disabled={step === total} onClick={() => setStep((s) => s + 1)} icon="next" />
                <IconButton label="Final position" disabled={step === total} onClick={() => setStep(total)} icon="last" />
              </div>
            ) : (
              exercise && <p className="board-caption">Starting position · play the line in your head</p>
            )}
          </div>
        </section>

        <section className="panel">
          {phase.name === "error" && (
            <div className="card">
              <p className="error">{phase.message}</p>
              <button
                className="button button--primary"
                onClick={() => (puzzlesRef.current ? nextExercise(settings) : location.reload())}
              >
                Try again
              </button>
            </div>
          )}

          {exercise && (
            <div className="card exercise">
              <div className="exercise__meta">
                <span className={`turn turn--${toMove}`}>
                  <span className="turn__dot" aria-hidden />
                  {toMove === "w" ? "White" : "Black"} to move
                </span>
                <span className="exercise__rating">
                  Puzzle rating {exercise.rating}
                  {revealed && (
                    <>
                      {" · "}
                      <a href={`https://lichess.org/training/${exercise.puzzleId}`} target="_blank" rel="noreferrer">
                        Lichess ↗
                      </a>
                    </>
                  )}
                </span>
              </div>

              <table className="moves">
                <tbody>
                  {moveRows(exercise.startFen, total).map((row) => (
                    <tr key={row.number}>
                      <th scope="row">{row.number}.</th>
                      {[row.white, row.black].map((ply, col) => (
                        <td key={col}>
                          {ply === null ? (
                            row.white === null && col === 0 ? <span className="move move--empty">…</span> : null
                          ) : revealed ? (
                            <button
                              className={`move${step === ply + 1 ? " move--current" : ""}`}
                              onClick={() => setStep(ply + 1)}
                            >
                              {exercise.moves[ply].san}
                            </button>
                          ) : (
                            <span className="move">{exercise.moves[ply].san}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="question">
                <h2 className="question__label">Question</h2>
                <p className="question__prompt">{exercise.question.prompt}</p>
                {exercise.question.hint && <p className="question__hint">{exercise.question.hint}</p>}
                {phase.name === "asking" && (
                  <AnswerInput key={exercise.startFen} question={exercise.question} orientation={orientation} onSubmit={submit} />
                )}
                {phase.name === "revealed" && (
                  <div className={`result ${phase.correct ? "result--correct" : "result--wrong"}`} role="status">
                    <div className="result__head">
                      <span className="result__icon" aria-hidden>
                        {phase.correct ? "✓" : "✕"}
                      </span>
                      <span className="result__title">
                        {phase.correct ? "Correct" : `Not quite (you said ${formatAnswer(exercise.question, phase.given)})`}
                      </span>
                    </div>
                    <p className="result__explanation">{exercise.question.explanation}</p>
                  </div>
                )}
              </div>

              {revealed && (
                <div className="exercise__actions">
                  <button className="button button--primary" autoFocus onClick={() => nextExercise(settings)}>
                    Next exercise
                  </button>
                  <span className="kbd-hint">
                    <kbd>Enter</kbd> next · <kbd>←</kbd>
                    <kbd>→</kbd> replay
                  </span>
                </div>
              )}
            </div>
          )}

          <details className="card settings">
            <summary>
              Settings
              <svg className="settings__chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="field">
              <span className="field__label" id="length-label">
                Sequence length <span className="field__hint">(half-moves)</span>
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="length-label">
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={settings.plies === n}
                    className={settings.plies === n ? "is-active" : ""}
                    onClick={() => updateSettings({ ...settings, plies: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field__label">Question types</span>
              <div className="chips">
                {QUESTION_KINDS.map(({ kind, label }) => {
                  const on = settings.kinds.includes(kind);
                  return (
                    <button
                      key={kind}
                      className={`chip${on ? " is-active" : ""}`}
                      aria-pressed={on}
                      onClick={() =>
                        updateSettings({
                          ...settings,
                          kinds: on ? settings.kinds.filter((k) => k !== kind) : [...settings.kinds, kind],
                        })
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {settings.kinds.length === 0 && <p className="error">Pick at least one question type.</p>}
            </div>
          </details>
        </section>
      </main>

      <footer className="footer">
        Puzzles from the <a href="https://database.lichess.org/#puzzles">Lichess puzzle database</a> (CC0) · Pieces by
        Colin M.L. Burnett
      </footer>
    </div>
  );
}

const ICON_PATHS = {
  first: "M7 6v12M18 6l-8 6 8 6z",
  prev: "M16 6l-8 6 8 6z",
  next: "M8 6l8 6-8 6z",
  last: "M17 6v12M6 6l8 6-8 6z",
};

function IconButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: keyof typeof ICON_PATHS;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className="icon-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path d={ICON_PATHS[icon]} fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** A 2x2 checker mark used as the app logo. */
function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 24 24" width="28" height="28" aria-hidden>
      <rect width="24" height="24" rx="6" fill="var(--sq-dark)" />
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="var(--sq-light)" />
      <rect x="12" y="12" width="8" height="8" rx="1.5" fill="var(--sq-light)" />
    </svg>
  );
}
