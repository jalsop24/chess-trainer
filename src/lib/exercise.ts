import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

export type Rng = () => number;

export const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** A row of public/puzzles.json: [id, fen, uciMoves, rating]. See scripts/build-puzzles.mjs. */
export type Puzzle = [id: string, fen: string, moves: string, rating: number];

export type QuestionKind = "material" | "squareContents" | "pieceLocation" | "moveLegality";

export const QUESTION_KINDS: { kind: QuestionKind; label: string }[] = [
  { kind: "material", label: "Material balance" },
  { kind: "squareContents", label: "What's on a square" },
  { kind: "pieceLocation", label: "Where did a piece go" },
  { kind: "moveLegality", label: "Is a move legal" },
];

/** e.g. "wN", "bp" */
export type PieceCode = `${Color}${PieceSymbol}`;

export type Question =
  | { kind: "material"; prompt: string; answer: number; explanation: string }
  | { kind: "squareContents"; prompt: string; square: Square; answer: PieceCode | "empty"; explanation: string }
  | { kind: "pieceLocation"; prompt: string; answer: Square | "captured"; explanation: string }
  | { kind: "moveLegality"; prompt: string; answer: boolean; explanation: string };

export interface SequenceMove {
  san: string;
  from: Square;
  to: Square;
  fenAfter: string;
}

export interface Exercise {
  puzzleId: string;
  rating: number;
  /** The side that solves the puzzle; the board is shown from its point of view. */
  orientation: Color;
  startFen: string;
  moves: SequenceMove[];
  finalFen: string;
  question: Question;
}

export interface GenerateOptions {
  puzzles: Puzzle[];
  plies: number;
  kinds: QuestionKind[];
  rng?: Rng;
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const colorName = (c: Color) => (c === "w" ? "White" : "Black");

export function describePiece(code: PieceCode | "empty"): string {
  if (code === "empty") return "Empty";
  return `${colorName(code[0] as Color)} ${PIECE_NAMES[code[1] as PieceSymbol]}`;
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function materialCount(chess: Chess): { w: number; b: number } {
  const total = { w: 0, b: 0 };
  for (const row of chess.board()) {
    for (const sq of row) if (sq) total[sq.color] += PIECE_VALUES[sq.type];
  }
  return total;
}

/** Formats moves with numbering, e.g. "14. Nxe4 dxe4 15. Qxe4" or "14... dxe4". */
export function formatMoves(startFen: string, sans: string[]): string[] {
  const [, turn, , , , fullmove] = startFen.split(" ");
  let moveNo = Number(fullmove);
  let white = turn === "w";
  return sans.map((san, i) => {
    let label: string;
    if (white) label = `${moveNo}. ${san}`;
    else label = i === 0 ? `${moveNo}... ${san}` : san;
    if (!white) moveNo++;
    white = !white;
    return label;
  });
}

// ---------------------------------------------------------------------------
// Piece tracking: follow each piece from its starting square through the line.

interface TrackedPiece {
  start: Square;
  color: Color;
  type: PieceSymbol;
  square: Square | null; // null once captured
  timesMoved: number;
}

function trackPieces(startFen: string, moves: Move[]): TrackedPiece[] {
  const chess = new Chess(startFen);
  const pieces: TrackedPiece[] = [];
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq) pieces.push({ start: sq.square, color: sq.color, type: sq.type, square: sq.square, timesMoved: 0 });
    }
  }
  const at = (s: Square) => pieces.find((p) => p.square === s);
  for (const m of moves) {
    const captureSquare = m.isEnPassant() ? ((m.to[0] + m.from[1]) as Square) : m.to;
    const victim = m.captured ? at(captureSquare) : undefined;
    if (victim) victim.square = null;
    const mover = at(m.from)!;
    mover.square = m.to;
    mover.timesMoved++;
    if (m.isKingsideCastle() || m.isQueensideCastle()) {
      const rank = m.from[1];
      const [rookFrom, rookTo] = m.isKingsideCastle() ? ["h", "f"] : ["a", "d"];
      at(`${rookFrom}${rank}` as Square)!.square = `${rookTo}${rank}` as Square;
    }
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Question builders. Each returns null when the line doesn't suit that kind.

function materialQuestion(start: Chess, final: Chess, moves: Move[]): Question | null {
  if (!moves.some((m) => m.captured || m.promotion)) return null;
  const before = materialCount(start);
  const after = materialCount(final);
  const balance = after.w - after.b;
  const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return {
    kind: "material",
    prompt:
      "After these moves, what is the material balance? Answer as White minus Black in points (P=1, N=B=3, R=5, Q=9).",
    answer: balance,
    explanation: `White ${after.w} vs Black ${after.b}, so the balance is ${fmt(balance)} (it was ${fmt(before.w - before.b)} before the sequence).`,
  };
}

function squareContentsQuestion(final: Chess, moves: Move[], rng: Rng): Question | null {
  const squares = [...new Set(moves.flatMap((m) => [m.from, m.to]))];
  // Squares a piece moved through are the interesting ones; skip ones that
  // were vacated and stayed empty only half the time so answers vary.
  const occupied = squares.filter((s) => final.get(s));
  const pool = occupied.length > 0 && rng() < 0.7 ? occupied : squares;
  const square = pick(pool, rng);
  const piece = final.get(square);
  const answer: PieceCode | "empty" = piece ? `${piece.color}${piece.type}` : "empty";
  return {
    kind: "squareContents",
    prompt: `After these moves, what is on ${square}?`,
    square,
    answer,
    explanation: answer === "empty" ? `${square} is empty.` : `There is a ${describePiece(answer).toLowerCase()} on ${square}.`,
  };
}

function pieceLocationQuestion(startFen: string, moves: Move[], rng: Rng): Question | null {
  const pieces = trackPieces(startFen, moves);
  const interesting = pieces.filter((p) => p.timesMoved >= 2 || (p.square === null && p.type !== "p"));
  const fallback = pieces.filter((p) => p.timesMoved >= 1);
  const pool = interesting.length > 0 ? interesting : moves.length >= 4 ? fallback : [];
  if (pool.length === 0) return null;
  const piece = pick(pool, rng);
  const name = `${colorName(piece.color)} ${PIECE_NAMES[piece.type]}`;
  return {
    kind: "pieceLocation",
    prompt: `Where is the ${name} that started on ${piece.start} now? (Click its square, or choose "Captured".)`,
    answer: piece.square ?? "captured",
    explanation: piece.square
      ? `The ${name} from ${piece.start} ends up on ${piece.square}.`
      : `The ${name} from ${piece.start} was captured.`,
  };
}

const moveKey = (m: Pick<Move, "from" | "to">) => `${m.from}${m.to}`;

function squaresBetween(from: Square, to: Square): Square[] {
  const df = Math.sign(to.charCodeAt(0) - from.charCodeAt(0));
  const dr = Math.sign(Number(to[1]) - Number(from[1]));
  const out: Square[] = [];
  let f = from.charCodeAt(0) + df;
  let r = Number(from[1]) + dr;
  while (`${String.fromCharCode(f)}${r}` !== to) {
    out.push(`${String.fromCharCode(f)}${r}` as Square);
    f += df;
    r += dr;
    if (out.length > 8) break; // not on a line; caller only uses this for sliders
  }
  return out;
}

function illegalReason(final: Chess, from: Square, to: Square): string {
  const piece = final.get(from)!;
  const target = final.get(to);
  if (target && target.color === piece.color) {
    return `${to} is occupied by ${colorName(piece.color)}'s own ${PIECE_NAMES[target.type]}.`;
  }
  if (piece.type === "p") {
    if (from[0] === to[0]) return `the pawn's path is blocked.`;
    return `there is nothing for the pawn to capture on ${to}.`;
  }
  if (piece.type === "b" || piece.type === "r" || piece.type === "q") {
    const blocker = squaresBetween(from, to).find((s) => final.get(s));
    if (blocker) {
      const b = final.get(blocker)!;
      return `the ${colorName(b.color).toLowerCase()} ${PIECE_NAMES[b.type]} on ${blocker} is in the way.`;
    }
  }
  if (final.inCheck()) return `${colorName(piece.color)} is in check and this move doesn't deal with it.`;
  return `it would leave ${colorName(piece.color)}'s king in check.`;
}

function moveLegalityQuestion(start: Chess, final: Chess, moves: Move[], rng: Rng): Question | null {
  if (final.isGameOver()) return null;
  const side = final.turn();
  const simple = (m: Move) => !m.promotion && !m.isKingsideCastle() && !m.isQueensideCastle();
  const legalNow = final.moves({ verbose: true }).filter(simple);
  const legalNowKeys = new Set(legalNow.map(moveKey));

  // Moves this side could play earlier in the line (on its own turn).
  const replay = new Chess(start.fen());
  const earlier = new Map<string, Move>();
  const collect = () => {
    if (replay.turn() !== side) return;
    for (const m of replay.moves({ verbose: true }).filter(simple)) earlier.set(moveKey(m), m);
  };
  collect();
  for (const m of moves.slice(0, -1)) {
    replay.move(m);
    collect();
  }

  const samePieceStillThere = (m: Move) => {
    const p = final.get(m.from);
    return p && p.color === m.color && p.type === m.piece;
  };
  const nowIllegal = [...earlier.values()].filter((m) => !legalNowKeys.has(moveKey(m)) && samePieceStillThere(m));
  const nowLegal = legalNow.filter((m) => !earlier.has(moveKey(m)));

  const wantLegal = rng() < 0.5;
  const pool = wantLegal ? nowLegal : nowIllegal;
  if (pool.length === 0) return null;
  const m = pick(pool, rng);
  const target = final.get(m.to);
  const verb = target && target.color !== side ? `capture on ${m.to}` : `move to ${m.to}`;
  return {
    kind: "moveLegality",
    prompt: `After these moves it's ${colorName(side)} to play. Can the ${PIECE_NAMES[m.piece]} on ${m.from} legally ${verb}?`,
    answer: wantLegal,
    explanation: wantLegal
      ? `Yes — ${m.from}-${m.to} is legal in the final position.`
      : `No — ${illegalReason(final, m.from, m.to)}`,
  };
}

// ---------------------------------------------------------------------------

function buildQuestion(
  kind: QuestionKind,
  startFen: string,
  moves: Move[],
  rng: Rng,
): Question | null {
  const start = new Chess(startFen);
  const final = new Chess(moves[moves.length - 1].after);
  switch (kind) {
    case "material":
      return materialQuestion(start, final, moves);
    case "squareContents":
      return squareContentsQuestion(final, moves, rng);
    case "pieceLocation":
      return pieceLocationQuestion(startFen, moves, rng);
    case "moveLegality":
      return moveLegalityQuestion(start, final, moves, rng);
  }
}

/** Plays UCI moves (e.g. "e2e4", "e7e8q") from a FEN, returning chess.js moves. */
export function playUci(fen: string, uci: string[]): Move[] {
  const chess = new Chess(fen);
  return uci.map((m) => chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }));
}

/**
 * Builds an exercise from a random puzzle whose line has at least `plies`
 * half-moves. The sequence starts from the real game position (before the
 * opponent's move that set up the puzzle) and is cut to `plies` half-moves.
 */
export function generateExercise({ puzzles, plies, kinds, rng = Math.random }: GenerateOptions): Exercise {
  if (kinds.length === 0) throw new Error("Select at least one question type");
  const pool = puzzles.filter(([, , moves]) => moves.split(" ").length >= plies);
  if (pool.length === 0) throw new Error(`No puzzles with a line of ${plies} half-moves`);
  for (let attempt = 0; attempt < 50; attempt++) {
    const [puzzleId, startFen, uci, rating] = pick(pool, rng);
    const moves = playUci(startFen, uci.split(" ").slice(0, plies));
    for (const kind of shuffle(kinds, rng)) {
      const question = buildQuestion(kind, startFen, moves, rng);
      if (!question) continue;
      return {
        puzzleId,
        rating,
        orientation: startFen.split(" ")[1] === "w" ? "b" : "w",
        startFen,
        moves: moves.map((m) => ({ san: m.san, from: m.from, to: m.to, fenAfter: m.after })),
        finalFen: moves[moves.length - 1].after,
        question,
      };
    }
  }
  throw new Error("Could not generate an exercise; try different settings");
}
