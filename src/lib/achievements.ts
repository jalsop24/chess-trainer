import type { AnswerRecord, Progress } from "./progress";
import { QUESTION_KINDS } from "./exercise";

export type AchievementIcon = "check" | "flame" | "target" | "depth" | "scales" | "star" | "calendar";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: AchievementIcon;
  /** Checked after each answer is recorded; `p` already includes `last`. */
  check: (p: Progress, last: AnswerRecord) => boolean;
}

const streak = <I extends string>(n: number, id: I, title: string): Achievement & { id: I } => ({
  id,
  title,
  description: `Get ${n} answers right in a row.`,
  icon: "flame",
  check: (p) => p.totals.streak >= n,
});

const solved = <I extends string>(n: number, id: I, title: string): Achievement & { id: I } => ({
  id,
  title,
  description: `Answer ${n} questions correctly.`,
  icon: "check",
  check: (p) => p.totals.correct >= n,
});

const days = <I extends string>(n: number, id: I, title: string): Achievement & { id: I } => ({
  id,
  title,
  description: `Reach your daily goal ${n} days in a row.`,
  icon: "calendar",
  check: (p) => p.dayStreak.count >= n,
});

export const ACHIEVEMENTS = [
  { id: "first-correct", title: "First steps", description: "Answer a question correctly.", icon: "check", check: (p) => p.totals.correct >= 1 },
  streak(5, "streak-5", "On a roll"),
  streak(10, "streak-10", "Sharp eyes"),
  streak(25, "streak-25", "Unstoppable"),
  solved(50, "solved-50", "Getting serious"),
  solved(100, "solved-100", "Centurion"),
  solved(500, "solved-500", "Grandmaster of the mind"),
  {
    id: "deep-line",
    title: "Deep calculator",
    description: "Answer correctly after a line of 8 or more half-moves.",
    icon: "depth",
    check: (_, last) => last.correct && last.plies >= 8,
  },
  {
    id: "accountant",
    title: "Accountant",
    description: "Get a material count right after 6 or more half-moves.",
    icon: "scales",
    check: (_, last) => last.correct && last.kind === "material" && last.plies >= 6,
  },
  {
    id: "all-rounder",
    title: "All-rounder",
    description: "Answer 10 questions of every type correctly.",
    icon: "star",
    check: (p) => QUESTION_KINDS.every(({ kind }) => (p.byKind[kind]?.correct ?? 0) >= 10),
  },
  {
    id: "daily-goal",
    title: "Daily dose",
    description: "Reach your daily goal.",
    icon: "target",
    check: (p) => p.dayStreak.count >= 1,
  },
  days(3, "days-3", "Habit forming"),
  days(7, "days-7", "Week of focus"),
] as const satisfies readonly Achievement[];

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];
