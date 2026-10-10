import { useCallback, useEffect, useRef, useState } from "react";
import type { Color, Square } from "chess.js";
import { Board } from "./components/Board";
import { AnswerInput, formatAnswer, type AnswerValue } from "./components/AnswerInput";
import { ExerciseGenerator } from "./lib/generator";
import { QUESTION_KINDS, formatMoves, type Exercise, type QuestionKind } from "./lib/exercise";

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

const settingsKey = (s: Settings) => `${s.plies}:${[...s.kinds].sort().join(",")}`;

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "asking"; exercise: Exercise }
  | { name: "revealed"; exercise: Exercise; given: AnswerValue; correct: boolean };

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => load("settings", DEFAULT_SETTINGS));
  const [stats, setStats] = useState<Stats>(() => load("stats", EMPTY_STATS));
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [step, setStep] = useState(0);

  const generatorRef = useRef<ExerciseGenerator | null>(null);
  const prefetchRef = useRef<{ key: string; promise: Promise<Exercise> } | null>(null);
  const requestRef = useRef(0); // ignore results from superseded requests

  useEffect(() => save("settings", settings), [settings]);
  useEffect(() => save("stats", stats), [stats]);

  const prefetch = useCallback((s: Settings) => {
    const gen = generatorRef.current;
    if (!gen) return;
    const promise = gen.generate(s);
    promise.catch(() => {}); // surfaced when consumed
    prefetchRef.current = { key: settingsKey(s), promise };
  }, []);

  const nextExercise = useCallback(
    async (s: Settings) => {
      const gen = generatorRef.current;
      if (!gen) return;
      const request = ++requestRef.current;
      setPhase({ name: "loading" });
      const ready = prefetchRef.current?.key === settingsKey(s) ? prefetchRef.current.promise : gen.generate(s);
      prefetchRef.current = null;
      try {
        const exercise = await ready;
        if (request !== requestRef.current) return;
        setPhase({ name: "asking", exercise });
        prefetch(s); // have the following one ready by the time it's needed
      } catch (err) {
        if (request !== requestRef.current) return;
        setPhase({ name: "error", message: err instanceof Error ? err.message : String(err) });
      }
    },
    [prefetch],
  );

  useEffect(() => {
    const gen = new ExerciseGenerator();
    generatorRef.current = gen;
    nextExercise(settings);
    return () => {
      gen.terminate();
      generatorRef.current = null;
      prefetchRef.current = null;
    };
    // Only on mount; settings changes trigger their own regeneration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    if (s.kinds.length > 0) {
      prefetchRef.current = null;
      if (phase.name !== "revealed") nextExercise(s);
    }
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
      else if (e.key === "Enter") nextExercise(settings);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, settings, nextExercise]);

  const exercise = phase.name === "asking" || phase.name === "revealed" ? phase.exercise : null;
  const orientation: Color = exercise ? (exercise.startFen.split(" ")[1] as Color) : "w";

  let boardFen = exercise?.startFen ?? "8/8/8/8/8/8/8/8 w - - 0 1";
  let highlight: Square[] = [];
  if (exercise && phase.name === "revealed" && step > 0) {
    const m = exercise.moves[step - 1];
    boardFen = m.fenAfter;
    highlight = [m.from, m.to];
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Visualisation Trainer</h1>
        <div className="stats" aria-label="Score">
          <span><strong>{stats.correct}</strong>/{stats.answered} correct</span>
          <span>Streak <strong>{stats.streak}</strong></span>
          <span>Best <strong>{stats.best}</strong></span>
          <button className="link" onClick={() => setStats(EMPTY_STATS)}>Reset</button>
        </div>
      </header>

      <main className="layout">
        <section className="board-area">
          <div className={`board-wrap${phase.name === "loading" ? " board-wrap--loading" : ""}`}>
            <Board fen={boardFen} orientation={orientation} highlight={highlight} />
            {phase.name === "loading" && <div className="overlay">Setting up a position…</div>}
          </div>
          {exercise && phase.name === "revealed" && (
            <div className="stepper">
              <button onClick={() => setStep(0)} disabled={step === 0} aria-label="Start position">⏮</button>
              <button onClick={() => setStep((s) => s - 1)} disabled={step === 0} aria-label="Previous move">◀</button>
              <span>{step === 0 ? "Start" : `After ${step}/${exercise.moves.length}`}</span>
              <button onClick={() => setStep((s) => s + 1)} disabled={step === exercise.moves.length} aria-label="Next move">▶</button>
              <button onClick={() => setStep(exercise.moves.length)} disabled={step === exercise.moves.length} aria-label="Final position">⏭</button>
            </div>
          )}
        </section>

        <section className="panel">
          {phase.name === "error" && (
            <div className="card">
              <p className="error">{phase.message}</p>
              <button className="primary" onClick={() => nextExercise(settings)}>Try again</button>
            </div>
          )}

          {exercise && (
            <>
              <div className="card">
                <div className="meta">
                  {exercise.opening} · {orientation === "w" ? "White" : "Black"} to move
                </div>
                <ol className="moves">
                  {formatMoves(exercise.startFen, exercise.moves.map((m) => m.san)).map((label, i) => (
                    <li key={i}>
                      {phase.name === "revealed" ? (
                        <button className={`move${step === i + 1 ? " move--current" : ""}`} onClick={() => setStep(i + 1)}>
                          {label}
                        </button>
                      ) : (
                        <span className="move">{label}</span>
                      )}
                    </li>
                  ))}
                </ol>
                <p className="hint">
                  {phase.name === "asking"
                    ? "Play these moves in your head. Don't move the pieces!"
                    : "Click a move or use ← → to replay the line."}
                </p>
              </div>

              <div className="card">
                <p className="prompt">{exercise.question.prompt}</p>
                {phase.name === "asking" && (
                  <AnswerInput key={exercise.startFen} question={exercise.question} orientation={orientation} onSubmit={submit} />
                )}
                {phase.name === "revealed" && (
                  <div className={`result ${phase.correct ? "result--correct" : "result--wrong"}`}>
                    <p className="result-title">
                      {phase.correct ? "Correct!" : `Not quite: you answered ${formatAnswer(exercise.question, phase.given)}.`}
                    </p>
                    <p>{exercise.question.explanation}</p>
                    <button className="primary" autoFocus onClick={() => nextExercise(settings)}>
                      Next exercise ↵
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <details className="card settings">
            <summary>Settings</summary>
            <label className="field">
              <span>Sequence length: <strong>{settings.plies}</strong> half-moves</span>
              <input
                type="range"
                min={2}
                max={10}
                value={settings.plies}
                onChange={(e) => updateSettings({ ...settings, plies: Number(e.target.value) })}
              />
            </label>
            <fieldset className="field">
              <legend>Question types</legend>
              {QUESTION_KINDS.map(({ kind, label }) => (
                <label key={kind} className="checkbox">
                  <input
                    type="checkbox"
                    checked={settings.kinds.includes(kind)}
                    onChange={(e) =>
                      updateSettings({
                        ...settings,
                        kinds: e.target.checked ? [...settings.kinds, kind] : settings.kinds.filter((k) => k !== kind),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
              {settings.kinds.length === 0 && <p className="error">Pick at least one question type.</p>}
            </fieldset>
          </details>
        </section>
      </main>
    </div>
  );
}
