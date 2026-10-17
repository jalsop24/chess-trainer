import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, type AchievementId } from "./achievements";
import { QUESTION_KINDS } from "./exercise";
import {
  addDays,
  currentDayStreak,
  dayKey,
  emptyProgress,
  loadProgress,
  recordAnswer,
  todayCorrect,
  type AnswerRecord,
  type Progress,
} from "./progress";

const day = (d: number, hour = 12) => new Date(2026, 9, d, hour); // October 2026, local time
const right: AnswerRecord = { kind: "defenders", plies: 4, correct: true };
const wrong: AnswerRecord = { ...right, correct: false };

/** Records answers in order, returning the final state plus everything unlocked. */
function play(answers: AnswerRecord[], now: Date, goal = 10, start = emptyProgress()) {
  let p = start;
  const unlocked: AchievementId[] = [];
  let goalMet = 0;
  for (const a of answers) {
    const r = recordAnswer(p, a, now, goal);
    p = r.progress;
    unlocked.push(...r.unlocked);
    if (r.goalMet) goalMet++;
  }
  return { p, unlocked, goalMet };
}

const times = (n: number, a: AnswerRecord) => Array<AnswerRecord>(n).fill(a);

describe("dates", () => {
  it("uses local calendar days", () => {
    expect(dayKey(day(11, 0))).toBe("2026-10-11");
    expect(dayKey(day(11, 23))).toBe("2026-10-11");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("recordAnswer", () => {
  it("updates totals, streak and per-type / per-length tallies", () => {
    const { p } = play([right, right, { ...wrong, kind: "material", plies: 6 }, right], day(11));
    expect(p.totals).toEqual({ answered: 4, correct: 3, streak: 1, best: 2 });
    expect(p.byKind.defenders).toEqual({ answered: 3, correct: 3 });
    expect(p.byKind.material).toEqual({ answered: 1, correct: 0 });
    expect(p.byPlies[4]).toEqual({ answered: 3, correct: 3 });
    expect(p.byPlies[6]).toEqual({ answered: 1, correct: 0 });
  });

  it("does not mutate the previous state", () => {
    const start = emptyProgress();
    recordAnswer(start, right, day(11), 10);
    expect(start).toEqual(emptyProgress());
  });

  it("resets today's count on a new day", () => {
    const { p } = play(times(3, right), day(11));
    expect(todayCorrect(p, day(11))).toBe(3);
    expect(todayCorrect(p, day(12))).toBe(0);
    const next = play([right], day(12), 10, p).p;
    expect(next.today).toEqual({ date: "2026-10-12", correct: 1 });
  });

  it("counts the goal once per day, and only correct answers towards it", () => {
    const { p, goalMet } = play([...times(2, right), wrong, ...times(5, right)], day(11), 3);
    expect(goalMet).toBe(1);
    expect(p.dayStreak).toEqual({ count: 1, best: 1, lastGoalDate: "2026-10-11" });
  });

  it("extends the day streak on consecutive days and restarts after a gap", () => {
    let p = play(times(2, right), day(11), 2).p;
    p = play(times(2, right), day(12), 2, p).p;
    expect(p.dayStreak.count).toBe(2);
    expect(currentDayStreak(p, day(12))).toBe(2);
    expect(currentDayStreak(p, day(13))).toBe(2); // still alive until today is over
    expect(currentDayStreak(p, day(14))).toBe(0); // a whole day missed

    p = play(times(2, right), day(14), 2, p).p;
    expect(p.dayStreak).toEqual({ count: 1, best: 2, lastGoalDate: "2026-10-14" });
  });
});

describe("achievements", () => {
  it("are typed as a closed set of ids", () => {
    // @ts-expect-error not a real achievement
    const bogus: AchievementId = "not-an-achievement";
    expect(ACHIEVEMENTS.some((a) => a.id === bogus)).toBe(false);
  });

  it("unlock once, at their threshold", () => {
    const { p, unlocked } = play(times(12, right), day(11), 100);
    expect(unlocked).toEqual(["first-correct", "streak-5", "streak-10"]);
    expect(p.achievements["streak-5"]).toBe("2026-10-11");

    // Breaking and rebuilding the streak doesn't unlock it again.
    const again = play([wrong, ...times(6, right)], day(12), 100, p);
    expect(again.unlocked).toEqual([]);
  });

  it("unlocks line-length and material badges from the answer just given", () => {
    expect(play([{ ...right, plies: 7 }], day(11)).unlocked).not.toContain("deep-line");
    expect(play([{ ...right, plies: 8 }], day(11)).unlocked).toContain("deep-line");
    expect(play([{ kind: "material", plies: 6, correct: true }], day(11)).unlocked).toContain("accountant");
    expect(play([{ kind: "defenders", plies: 6, correct: true }], day(11)).unlocked).not.toContain("accountant");
  });

  it("needs 10 correct in every question type for all-rounder", () => {
    const answers = QUESTION_KINDS.flatMap(({ kind }) => times(10, { kind, plies: 4, correct: true }));
    const { unlocked } = play(answers.slice(0, -1), day(11), 1000);
    expect(unlocked).not.toContain("all-rounder");
    expect(play(answers, day(11), 1000).unlocked).toContain("all-rounder");
  });

  it("unlocks daily-goal and day-streak badges", () => {
    let r = play(times(2, right), day(11), 2);
    expect(r.unlocked).toContain("daily-goal");
    let p: Progress = r.p;
    for (const d of [12, 13]) p = play(times(2, right), day(d), 2, p).p;
    expect(p.achievements["days-3"]).toBe("2026-10-13");
    expect(p.achievements["days-7"]).toBeUndefined();
  });
});

describe("loadProgress", () => {
  const storage = (items: Record<string, string>) => ({ getItem: (k: string) => items[k] ?? null });

  it("migrates the score saved by older versions", () => {
    const p = loadProgress(storage({ stats: JSON.stringify({ answered: 9, correct: 7, streak: 3, best: 5 }) }));
    expect(p.totals).toEqual({ answered: 9, correct: 7, streak: 3, best: 5 });
    expect(p.achievements).toEqual({});
  });

  it("prefers saved progress and fills in missing fields", () => {
    const saved = { ...emptyProgress(), totals: { answered: 1, correct: 1, streak: 1, best: 1 } } as Partial<Progress>;
    delete saved.achievements;
    const p = loadProgress(storage({ progress: JSON.stringify(saved), stats: "{}" }));
    expect(p.totals.correct).toBe(1);
    expect(p.achievements).toEqual({});
  });

  it("starts fresh on unreadable data", () => {
    expect(loadProgress(storage({ progress: "{not json" }))).toEqual(emptyProgress());
  });
});
