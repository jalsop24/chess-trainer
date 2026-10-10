// A deliberately weak engine: just strong enough to avoid blunders that would
// make a position implausible, and random enough to give varied lines.

import { Chess, type Move, type PieceSymbol } from "chess.js";

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export type Rng = () => number;

const CENTIPAWNS: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const MATE = 100_000;

/** Small bonus for pieces nearer the centre; keeps play from looking aimless. */
function centrality(square: string): number {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return 7 - (Math.abs(3.5 - file) + Math.abs(3.5 - rank));
}

/** Static evaluation in centipawns from the side to move's point of view. */
export function evaluate(chess: Chess): number {
  let score = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      let value = CENTIPAWNS[sq.type];
      if (sq.type === "n" || sq.type === "b") value += centrality(sq.square) * 4;
      if (sq.type === "p") value += centrality(sq.square) * 2;
      score += sq.color === "w" ? value : -value;
    }
  }
  return chess.turn() === "w" ? score : -score;
}

// The search below uses SAN move lists rather than verbose ones: chess.js
// builds before/after FENs for every verbose move, which is ~15x slower.

/** Captures only, so the search doesn't stop in the middle of an exchange. */
function quiesce(chess: Chess, alpha: number, beta: number, depth: number): number {
  const standPat = evaluate(chess);
  if (depth === 0 || standPat >= beta) return standPat;
  if (standPat > alpha) alpha = standPat;
  for (const san of chess.moves()) {
    if (!san.includes("x")) continue;
    chess.move(san);
    const score = -quiesce(chess, -beta, -alpha, depth - 1);
    chess.undo();
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number): number {
  const moves = chess.moves();
  if (moves.length === 0) return chess.inCheck() ? -MATE : 0;
  if (depth === 0) return quiesce(chess, alpha, beta, 2);
  let best = -Infinity;
  for (const san of moves) {
    chess.move(san);
    const score = -negamax(chess, depth - 1, -beta, -alpha);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

export interface ChooseOptions {
  /** Moves scoring within this many centipawns of the best are candidates. */
  tolerance: number;
  /** Extra weight given to captures and checks when sampling candidates. */
  forcingBias: number;
}

/** Picks a reasonable move at random from the near-best moves. */
export function chooseMove(chess: Chess, rng: Rng, opts: ChooseOptions): Move | null {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  // Captures first so a good score is found early and the window can prune.
  moves.sort((a, b) => Number(!!b.captured) - Number(!!a.captured));
  let best = -Infinity;
  const scored = moves.map((m) => {
    chess.move(m.san);
    // Moves that can't get within `tolerance` of the best are never picked,
    // so their search can stop as soon as that's proven.
    const score = -negamax(chess, 1, -Infinity, -(best - opts.tolerance));
    chess.undo();
    best = Math.max(best, score);
    return { move: m, score };
  });
  const candidates = scored.filter((s) => s.score >= best - opts.tolerance);
  const weights = candidates.map((c) => {
    const forcing = c.move.captured || c.move.san.includes("+") ? opts.forcingBias : 0;
    return 1 + forcing;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i].move;
  }
  return candidates[candidates.length - 1].move;
}

/** Mulberry32: tiny seedable PRNG so exercises can be reproduced in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
