import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { OPENINGS } from "./openings";
import { seededRng } from "./engine";
import { QUESTION_KINDS, formatMoves, generateExercise, materialCount } from "./exercise";

describe("openings", () => {
  it.each(OPENINGS.map((o) => [o.name, o.moves]))("%s is a legal line", (_name, moves) => {
    const chess = new Chess();
    for (const san of moves.split(" ")) expect(() => chess.move(san)).not.toThrow();
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
      for (let seed = 1; seed <= 3; seed++) {
        const ex = generateExercise({ plies: 4, kinds: [kind], rng: seededRng(seed) });
        expect(ex.question.kind).toBe(kind);
        expect(ex.moves).toHaveLength(4);

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
    }, 60_000);
  }
});
