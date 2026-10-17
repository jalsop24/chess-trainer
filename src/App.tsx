import { useCallback, useEffect, useRef, useState } from "react";
import type { Color, Square } from "chess.js";
import { Board } from "./components/Board";
import { AnswerInput, MaterialComparison, formatAnswer } from "./components/AnswerInput";
import { GoalRing } from "./components/GoalRing";
import { ProgressDialog } from "./components/ProgressDialog";
import { SettingsMenu, settingsKey, type Settings } from "./components/SettingsMenu";
import { Toasts, type Toast } from "./components/Toasts";
import { ACHIEVEMENTS } from "./lib/achievements";
import {
  QUESTION_KINDS,
  checkAnswer,
  moveRows,
  generateExercise,
  type AnswerValue,
  type Exercise,
  type MaterialCounts,
  type Puzzle,
} from "./lib/exercise";
import {
  currentDayStreak,
  emptyProgress,
  loadProgress,
  recordAnswer,
  saveProgress,
  todayCorrect,
  type Progress,
} from "./lib/progress";

const DEFAULT_SETTINGS: Settings = { plies: 4, kinds: QUESTION_KINDS.map((q) => q.kind), dailyGoal: 10 };

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
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [progressOpen, setProgressOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Which header numbers to animate after the latest answer; `n` re-triggers the animation.
  const [celebrate, setCelebrate] = useState({ n: 0, streak: false, best: false, goal: false });
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [step, setStep] = useState(0);
  // Settings the current exercise was made with; differs from `settings` after an edit.
  const [madeWith, setMadeWith] = useState<string | null>(null);

  const puzzlesRef = useRef<Puzzle[] | null>(null);
  const toastId = useRef(0);

  useEffect(() => save("settings", settings), [settings]);
  useEffect(() => saveProgress(progress), [progress]);

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const notify = (items: Omit<Toast, "id">[]) =>
    setToasts((ts) => [...ts, ...items.map((t) => ({ ...t, id: ++toastId.current }))]);

  const nextExercise = useCallback((s: Settings) => {
    const puzzles = puzzlesRef.current;
    if (!puzzles) return;
    try {
      setPhase({ name: "asking", exercise: generateExercise({ puzzles, plies: s.plies, kinds: s.kinds }) });
      setMadeWith(settingsKey(s));
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
    // Only on mount; settings changes apply from the next exercise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (given: AnswerValue) => {
    if (phase.name !== "asking") return;
    const correct = checkAnswer(phase.exercise.question, given);
    setPhase({ name: "revealed", exercise: phase.exercise, given, correct });
    setStep(phase.exercise.moves.length);

    const record = { kind: phase.exercise.question.kind, plies: phase.exercise.moves.length, correct };
    const result = recordAnswer(progress, record, new Date(), settings.dailyGoal);
    setProgress(result.progress);
    setCelebrate((c) => ({
      n: c.n + 1,
      streak: correct,
      best: result.progress.totals.best > progress.totals.best,
      goal: result.goalMet,
    }));

    const days = result.progress.dayStreak.count;
    notify([
      ...(result.goalMet
        ? [{ title: "Daily goal reached!", body: days > 1 ? `${days} days in a row.` : "Come back tomorrow to start a streak." }]
        : []),
      ...result.unlocked.map((id) => {
        const a = ACHIEVEMENTS.find((x) => x.id === id)!;
        return { title: `Achievement unlocked: ${a.title}`, body: a.description };
      }),
    ]);
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
  const now = new Date();
  const today = todayCorrect(progress, now);
  const dayStreak = currentDayStreak(progress, now);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <BrandMark />
          <h1>Visualisation Trainer</h1>
        </div>
        <div className="header__actions">
          <dl className="stats" aria-label="Score">
            <div className="stats__today">
              <dt>Today</dt>
              <dd>
                <GoalRing value={today} goal={settings.dailyGoal} size={22} />
                <span key={`goal${celebrate.n}`} className={celebrate.goal ? "celebrate" : ""}>
                  {Math.min(today, settings.dailyGoal)}
                  <span className="stats__of">/{settings.dailyGoal}</span>
                </span>
              </dd>
            </div>
            <div>
              <dt>Days</dt>
              <dd className={dayStreak > 0 ? "stats__flame is-lit" : "stats__flame"} title="Days in a row the daily goal was reached">
                <FlameIcon />
                {dayStreak}
              </dd>
            </div>
            <div>
              <dt>Streak</dt>
              <dd key={`streak${celebrate.n}`} className={celebrate.streak ? "pop" : ""}>
                {progress.totals.streak}
              </dd>
            </div>
            <div>
              <dt>Best</dt>
              <dd key={`best${celebrate.n}`} className={celebrate.best ? "celebrate" : ""}>
                {progress.totals.best}
              </dd>
            </div>
          </dl>
          <button
            className="header-button"
            aria-label="Progress and achievements"
            title="Progress and achievements"
            onClick={() => setProgressOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                d="M5 20V12M12 20V5M19 20v-9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <SettingsMenu
            settings={settings}
            onChange={setSettings}
            pending={exercise !== null && madeWith !== settingsKey(settings)}
            onApplyNow={() => nextExercise(settings)}
            onResetProgress={() => setProgress(emptyProgress())}
          />
        </div>
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
                {revealed && (
                  <a
                    className="exercise__link"
                    href={`https://lichess.org/training/${exercise.puzzleId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Lichess ↗
                  </a>
                )}
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
                        {phase.correct
                          ? "Correct"
                          : exercise.question.kind === "material"
                            ? "Not quite"
                            : `Not quite (you said ${formatAnswer(exercise.question, phase.given)})`}
                      </span>
                    </div>
                    <p className="result__explanation">{exercise.question.explanation}</p>
                    {exercise.question.kind === "material" && (
                      <MaterialComparison answer={exercise.question.answer} given={phase.given as MaterialCounts} />
                    )}
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

        </section>
      </main>

      <ProgressDialog
        open={progressOpen}
        onClose={() => setProgressOpen(false)}
        progress={progress}
        dailyGoal={settings.dailyGoal}
        now={now}
      />
      <Toasts toasts={toasts} onDismiss={dismissToast} />

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

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        d="M12 2.5c.6 3.4 4.8 6 4.8 11.1a4.8 4.8 0 0 1-9.6 0c0-2.4 1.2-4.2 2.4-5.3.2 1.8 1.1 3 2.3 3 0-3.4-1.1-6.3.1-8.8z"
        fill="currentColor"
      />
    </svg>
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
