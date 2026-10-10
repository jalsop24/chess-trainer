import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { QUESTION_KINDS, formatMoves, generateExercise, materialCount, playUci, type Puzzle } from "./exercise";
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

describe("formatMoves", () => {
  it("numbers a line starting with White", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 12";
    expect(formatMoves(fen, ["Nxe4", "dxe4", "Qxe4"])).toEqual(["12. Nxe4", "dxe4", "13. Qxe4"]);
  });

  it("numbers a line starting with Black", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 12";
    expect(formatMoves(fen, ["dxe4", "Qxe4"])).toEqual(["12... dxe4", "13. Qxe4"]);
  });
});

describe("generateExercise", () => {
  for (const { kind } of QUESTION_KINDS) {
    it(`produces consistent ${kind} questions`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const plies = [2, 4, 6, 10][seed % 4];
        const ex = generateExercise({ puzzles, plies, kinds: [kind], rng: seededRng(seed) });
        expect(ex.question.kind).toBe(kind);
        expect(ex.moves).toHaveLength(plies);

        // Replaying the SAN from the start position reaches the final position.
        const chess = new Chess(ex.startFen);
        for (const m of ex.moves) chess.move(m.san);
        expect(chess.fen()).toBe(ex.finalFen);

        const q = ex.question;
        if (q.kind === "material") {
          const { w, b } = materialCount(chess);
          expect(q.answer).toBe(w - b);
        } else if (q.kind === "squareContents") {
          const p = chess.get(q.square);
          expect(q.answer).toBe(p ? `${p.color}${p.type}` : "empty");
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
