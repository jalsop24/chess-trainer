import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  DEFENDERS_MAX,
  QUESTION_KINDS,
  checkAnswer,
  generateExercise,
  materialCount,
  moveRows,
  pieceCounts,
  playUci,
  type Puzzle,
} from "./exercise";
import puzzleData from "../../public/puzzles.json";

const puzzles = puzzleData as unknown as Puzzle[];

/** Mulberry32: tiny seedable PRNG so generated exercises are reproducible. */
function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("puzzle data", () => {
  it("has puzzles for every sequence length the settings allow", () => {
    for (let plies = 2; plies <= 10; plies++) {
      expect(puzzles.filter(([, , moves]) => moves.split(" ").length >= plies).length).toBeGreaterThan(100);
    }
  });

  it("contains only legal lines", () => {
    for (const [id, fen, moves] of puzzles) {
      expect(() => playUci(fen, moves.split(" ")), id).not.toThrow();
    }
  });
});

describe("moveRows", () => {
  it("numbers a line starting with White", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 12";
    expect(moveRows(fen, 3)).toEqual([
      { number: 12, white: 0, black: 1 },
      { number: 13, white: 2, black: null },
    ]);
  });

  it("numbers a line starting with Black", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 12";
    expect(moveRows(fen, 2)).toEqual([
      { number: 12, white: null, black: 0 },
      { number: 13, white: 1, black: null },
    ]);
  });
});

describe("generateExercise", () => {
  for (const { kind } of QUESTION_KINDS) {
    it(`produces consistent ${kind} questions`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const plies = [2, 4, 6, 10][seed % 4];
        const ex = generateExercise({ puzzles, plies, kinds: [kind], rng: seededRng(seed * 7919) });
        expect(ex.question.kind).toBe(kind);
        expect(ex.moves).toHaveLength(plies);

        // Replaying the SAN from the start position reaches the final position.
        const chess = new Chess(ex.startFen);
        for (const m of ex.moves) chess.move(m.san);
        expect(chess.fen()).toBe(ex.finalFen);

        const q = ex.question;
        const puzzle = puzzles.find(([id]) => id === ex.puzzleId)!;
        if (q.kind === "material") {
          expect(q.start).toEqual(pieceCounts(new Chess(ex.startFen)));
          expect(q.answer).toEqual(pieceCounts(chess));
          expect(q.answer).not.toEqual(q.start);
          // Material only tells the story when there's no mate and the solver is ahead.
          const { w, b } = materialCount(chess);
          expect(["crushing", "advantage"]).toContain(puzzle[4]);
          expect(chess.isCheckmate()).toBe(false);
          expect(ex.orientation === "w" ? w - b : b - w).toBeGreaterThan(0);
          // Every count has to be right.
          expect(checkAnswer(q, structuredClone(q.answer))).toBe(true);
          expect(checkAnswer(q, q.start)).toBe(false);
        } else if (q.kind === "defenders") {
          const piece = chess.get(q.square)!;
          expect(piece.type).not.toBe("k");
          expect(q.answer).toBe(chess.attackers(q.square, piece.color).length);
          expect(checkAnswer(q, Math.min(q.answer, DEFENDERS_MAX))).toBe(true);
          expect(checkAnswer(q, (q.answer + 1) % (DEFENDERS_MAX + 1))).toBe(false);
        } else if (q.kind === "pieceLocation") {
          if (q.answer !== "captured") expect(chess.get(q.answer)).toBeTruthy();
        } else if (q.kind === "moveLegality") {
          const [, from, to] = q.prompt.match(/on ([a-h][1-8]) legally (?:move to|capture on) ([a-h][1-8])/)!;
          const legal = chess.moves({ verbose: true }).some((m) => m.from === from && m.to === to);
          expect(legal).toBe(q.answer);
        }
      }
    });
  }
});

describe("piece location questions", () => {
  it("only ask about pieces that moved twice, or moved and were captured", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const ex = generateExercise({ puzzles, plies: 4, kinds: ["pieceLocation"], rng: seededRng(seed) });
      const [, start] = ex.question.prompt.match(/that started on ([a-h][1-8])/)!;
      // Follow the piece through the line to count its moves.
      let square = start;
      let moves = 0;
      for (const m of ex.moves) {
        if (m.from === square) {
          square = m.to;
          moves++;
        }
      }
      const captured = ex.question.answer === "captured";
      expect(moves >= 2 || (captured && moves >= 1), ex.puzzleId).toBe(true);
    }
  });
});

describe("checkAnswer", () => {
  it('treats the top defenders button as "that many or more"', () => {
    const q = { kind: "defenders", prompt: "", square: "e4", answer: 6, explanation: "" } as const;
    expect(checkAnswer(q, DEFENDERS_MAX)).toBe(true);
    expect(checkAnswer(q, DEFENDERS_MAX - 1)).toBe(false);
  });
});
