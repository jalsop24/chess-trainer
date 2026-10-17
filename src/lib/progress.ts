// Everything the app remembers about the player: score, per-type stats, the
// daily goal and day streak, and unlocked achievements. Pure functions so the
// rules (day rollover, streaks, unlocks) can be unit-tested; App persists it.

import type { QuestionKind } from "./exercise";
import { ACHIEVEMENTS, type AchievementId } from "./achievements";

export interface Tally {
  answered: number;
  correct: number;
}

export interface Progress {
  version: 1;
  totals: Tally & { streak: number; best: number };
  byKind: Partial<Record<QuestionKind, Tally>>;
  /** Keyed by sequence length in half-moves. */
  byPlies: Partial<Record<number, Tally>>;
  /** Correct answers on `date` (local "YYYY-MM-DD"); stale once the day changes. */
  today: { date: string; correct: number };
  dayStreak: { count: number; best: number; lastGoalDate: string | null };
  /** Achievement id -> local date it was unlocked. */
  achievements: Partial<Record<AchievementId, string>>;
}

export interface AnswerRecord {
  kind: QuestionKind;
  plies: number;
  correct: boolean;
}

export const emptyProgress = (): Progress => ({
  version: 1,
  totals: { answered: 0, correct: 0, streak: 0, best: 0 },
  byKind: {},
  byPlies: {},
  today: { date: "", correct: 0 },
  dayStreak: { count: 0, best: 0, lastGoalDate: null },
  achievements: {},
});

/** Local calendar day, so the day flips at the player's midnight. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

const bump = (tally: Tally | undefined, correct: boolean): Tally => ({
  answered: (tally?.answered ?? 0) + 1,
  correct: (tally?.correct ?? 0) + (correct ? 1 : 0),
});

export function recordAnswer(
  prev: Progress,
  answer: AnswerRecord,
  now: Date,
  dailyGoal: number,
): { progress: Progress; unlocked: AchievementId[]; goalMet: boolean } {
  const today = dayKey(now);
  const p = structuredClone(prev);
  if (p.today.date !== today) p.today = { date: today, correct: 0 };

  const { totals } = p;
  totals.answered++;
  if (answer.correct) {
    totals.correct++;
    totals.streak++;
    totals.best = Math.max(totals.best, totals.streak);
  } else {
    totals.streak = 0;
  }
  p.byKind[answer.kind] = bump(p.byKind[answer.kind], answer.correct);
  p.byPlies[answer.plies] = bump(p.byPlies[answer.plies], answer.correct);

  // The day streak counts days the goal was reached, so it only moves the
  // first time today's correct count reaches the goal.
  let goalMet = false;
  if (answer.correct) {
    p.today.correct++;
    if (p.today.correct >= dailyGoal && p.dayStreak.lastGoalDate !== today) {
      const continued = p.dayStreak.lastGoalDate === addDays(today, -1);
      p.dayStreak.count = continued ? p.dayStreak.count + 1 : 1;
      p.dayStreak.best = Math.max(p.dayStreak.best, p.dayStreak.count);
      p.dayStreak.lastGoalDate = today;
      goalMet = true;
    }
  }

  const unlocked = ACHIEVEMENTS.filter((a) => !p.achievements[a.id] && a.check(p, answer)).map((a) => a.id);
  for (const id of unlocked) p.achievements[id] = today;

  return { progress: p, unlocked, goalMet };
}

/** The day streak as it stands now: 0 once a whole day has passed without the goal. */
export function currentDayStreak(p: Progress, now: Date): number {
  const today = dayKey(now);
  const last = p.dayStreak.lastGoalDate;
  return last === today || last === addDays(today, -1) ? p.dayStreak.count : 0;
}

export function todayCorrect(p: Progress, now: Date): number {
  return p.today.date === dayKey(now) ? p.today.correct : 0;
}

const STORAGE_KEY = "progress";
const LEGACY_STATS_KEY = "stats";

/** Reads saved progress, migrating the score saved by older versions. */
export function loadProgress(storage: Pick<Storage, "getItem"> = localStorage): Progress {
  const base = emptyProgress();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return { ...base, ...JSON.parse(raw) };
    const legacy = storage.getItem(LEGACY_STATS_KEY);
    if (legacy) return { ...base, totals: { ...base.totals, ...JSON.parse(legacy) } };
  } catch {
    // Unreadable or unavailable storage: start fresh.
  }
  return base;
}

export function saveProgress(p: Progress, storage: Pick<Storage, "setItem"> = localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable (private mode etc.); progress just won't persist.
  }
}
