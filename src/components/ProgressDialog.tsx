import { useEffect, useRef } from "react";
import { ACHIEVEMENTS, type AchievementIcon } from "../lib/achievements";
import { QUESTION_KINDS } from "../lib/exercise";
import { currentDayStreak, todayCorrect, type Progress, type Tally } from "../lib/progress";
import { GoalRing } from "./GoalRing";

interface ProgressDialogProps {
  open: boolean;
  onClose: () => void;
  progress: Progress;
  dailyGoal: number;
  now: Date;
}

const LENGTHS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

const percent = (t: Tally) => Math.round((t.correct / t.answered) * 100);

const formatDate = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Daily goal, overall numbers, accuracy breakdowns and achievements, in a modal. */
export function ProgressDialog({ open, onClose, progress, dailyGoal, now }: ProgressDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // Drive the native <dialog> from React state; it handles Escape, focus and the backdrop.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const { totals, dayStreak } = progress;
  const today = todayCorrect(progress, now);
  const unlockedCount = ACHIEVEMENTS.filter((a) => progress.achievements[a.id]).length;

  return (
    <dialog
      ref={ref}
      className="progress-dialog"
      aria-labelledby="progress-title"
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="progress">
        <header className="progress__header">
          <h2 id="progress-title">Your progress</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="progress__overview">
          <div className="tile tile--goal">
            <GoalRing value={today} goal={dailyGoal} size={64} />
            <div>
              <div className="tile__value">
                {Math.min(today, dailyGoal)}
                <span className="tile__of">/{dailyGoal}</span>
              </div>
              <div className="tile__label">{today >= dailyGoal ? "Daily goal reached" : "Correct today"}</div>
            </div>
          </div>
          <div className="tile">
            <div className="tile__value">{currentDayStreak(progress, now)}</div>
            <div className="tile__label">Day streak · best {dayStreak.best}</div>
          </div>
          <div className="tile">
            <div className="tile__value">{totals.answered ? `${percent(totals)}%` : "–"}</div>
            <div className="tile__label">
              {totals.correct}/{totals.answered} correct
            </div>
          </div>
          <div className="tile">
            <div className="tile__value">{totals.best}</div>
            <div className="tile__label">Best answer streak</div>
          </div>
        </section>

        <section className="progress__section">
          <h3>By question type</h3>
          <Bars rows={QUESTION_KINDS.map(({ kind, label }) => ({ label, tally: progress.byKind[kind] }))} />
        </section>

        <section className="progress__section">
          <h3>By sequence length</h3>
          <Bars rows={LENGTHS.map((n) => ({ label: `${n} half-moves`, tally: progress.byPlies[n] }))} />
        </section>

        <section className="progress__section">
          <h3>
            Achievements{" "}
            <span className="progress__count">
              {unlockedCount}/{ACHIEVEMENTS.length}
            </span>
          </h3>
          <ul className="badges">
            {ACHIEVEMENTS.map((a) => {
              const date = progress.achievements[a.id];
              return (
                <li key={a.id} className={`badge${date ? " badge--unlocked" : ""}`}>
                  <span className="badge__icon">
                    <BadgeIcon icon={a.icon} />
                  </span>
                  <span className="badge__text">
                    <strong>{a.title}</strong>
                    <span>{a.description}</span>
                    {date && <span className="badge__date">Unlocked {formatDate(date)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </dialog>
  );
}

function Bars({ rows }: { rows: { label: string; tally: Tally | undefined }[] }) {
  return (
    <ul className="bars">
      {rows.map(({ label, tally }) => (
        <li key={label} className={`bar${tally ? "" : " bar--empty"}`}>
          <span className="bar__label">{label}</span>
          <span className="bar__track">
            {tally && <span className="bar__fill" style={{ width: `${percent(tally)}%` }} />}
          </span>
          <span className="bar__value">{tally ? `${percent(tally)}%` : "–"}</span>
          <span className="bar__count">{tally ? `${tally.correct}/${tally.answered}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}

const ICONS: Record<AchievementIcon, string> = {
  check: "M5 12.5l4.5 4.5L19 7",
  flame: "M12 3c.5 3 4 5.5 4 10a4 4 0 0 1-8 0c0-2 1-3.5 2-4.5.2 1.5 1 2.5 2 2.5 0-3-1-5.5 0-8z",
  target: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z",
  depth: "M12 3l9 5-9 5-9-5 9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5",
  scales: "M12 4v16M8 20h8M5 7h14M5 7l-3 6h6zM19 7l-3 6h6z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
};

function BadgeIcon({ icon }: { icon: AchievementIcon }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d={ICONS[icon]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
