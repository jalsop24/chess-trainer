import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

export type Rng = () => number;

export const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export type PuzzleGoal = "mate" | "crushing" | "advantage" | "equality";

/** A row of public/puzzles.json: [id, fen, uciMoves, rating, goal]. See scripts/build-puzzles.mjs. */
export type Puzzle = [id: string, fen: string, moves: string, rating: number, goal: PuzzleGoal];

export type QuestionKind = "material" | "defenders" | "pieceLocation" | "moveLegality";

export const QUESTION_KINDS: { kind: QuestionKind; label: string }[] = [
  { kind: "material", label: "Material count" },
  { kind: "defenders", label: "How many defenders" },
  { kind: "pieceLocation", label: "Where did a piece go" },
  { kind: "moveLegality", label: "Is a move legal" },
];

/** Pieces counted for material questions, in display order (kings are always there). */
export const MATERIAL_TYPES = ["q", "r", "b", "n", "p"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];
export type PieceCounts = Record<MaterialType, number>;
export type MaterialCounts = Record<Color, PieceCounts>;

/** Every question has a short `prompt` and an optional smaller `hint` with the rules. */
export type Question =
  | {
      kind: "material";
      prompt: string;
      hint?: string;
      /** Counts in the starting position, used to prefill the answer. */
      start: MaterialCounts;
      answer: MaterialCounts;
      explanation: string;
    }
  | { kind: "defenders"; prompt: string; hint?: string; square: Square; answer: number; explanation: string }
  | { kind: "pieceLocation"; prompt: string; hint?: string; answer: Square | "captured"; explanation: string }
  | { kind: "moveLegality"; prompt: string; hint?: string; answer: boolean; explanation: string };

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

export function pieceCounts(chess: Chess): MaterialCounts {
  const empty = (): PieceCounts => ({ q: 0, r: 0, b: 0, n: 0, p: 0 });
  const counts: MaterialCounts = { w: empty(), b: empty() };
  for (const row of chess.board()) {
    for (const sq of row) if (sq && sq.type !== "k") counts[sq.color][sq.type]++;
  }
  return counts;
}

export const sameCounts = (a: MaterialCounts, b: MaterialCounts) =>
  (["w", "b"] as const).every((c) => MATERIAL_TYPES.every((t) => a[c][t] === b[c][t]));

/** Answer values the UI can submit, one shape per question kind. */
export type AnswerValue = number | boolean | Square | "captured" | MaterialCounts;

/** Defender answers are buttons 0..DEFENDERS_MAX, the last meaning "this many or more". */
export const DEFENDERS_MAX = 5;

export function checkAnswer(question: Question, value: AnswerValue): boolean {
  if (question.kind === "material") return typeof value === "object" && sameCounts(question.answer, value);
  if (question.kind === "defenders") return value === Math.min(question.answer, DEFENDERS_MAX);
  return value === question.answer;
}

/** Total material in points (P=1, N=B=3, R=5, Q=9) per side. */
export function materialCount(chess: Chess): { w: number; b: number } {
  const total = { w: 0, b: 0 };
  for (const row of chess.board()) {
    for (const sq of row) if (sq) total[sq.color] += PIECE_VALUES[sq.type];
  }
  return total;
}

export interface MoveRow {
  number: number;
  /** Index into the sequence of White's move in this row, or null if absent. */
  white: number | null;
  black: number | null;
}

/**
 * Groups a sequence into numbered rows for a two-column move list. A line that
 * starts with Black gets an empty White slot in its first row ("14. … dxe4").
 */
export function moveRows(startFen: string, plies: number): MoveRow[] {
  const [, turn, , , , fullmove] = startFen.split(" ");
  const rows: MoveRow[] = [];
  let number = Number(fullmove);
  let white = turn === "w";
  for (let i = 0; i < plies; i++) {
    if (white || rows.length === 0) rows.push({ number, white: null, black: null });
    const row = rows[rows.length - 1];
    if (white) row.white = i;
    else {
      row.black = i;
      number++;
    }
    white = !white;
  }
  return rows;
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

/** Everything a question builder may look at. */
interface LineContext {
  start: Chess;
  final: Chess;
  /** The moves shown to the user. */
  moves: Move[];
  /** The puzzle's whole solution line, which may run past the shown moves. */
  fullLine: Move[];
  goal: PuzzleGoal;
  /** The side solving the puzzle, i.e. the side the puzzle says is better. */
  solver: Color;
}

const balanceOf = (chess: Chess) => {
  const { w, b } = materialCount(chess);
  return w - b;
};

/**
 * Only asked when material tells the true story of the position: the puzzle
 * isn't won by mate, the solver (who Lichess says ends up better) is ahead,
 * and no captures are still pending later in the line.
 */
function materialQuestion({ start, final, moves, fullLine, goal, solver }: LineContext): Question | null {
  if (goal !== "crushing" && goal !== "advantage") return null;
  if (final.isCheckmate()) return null;
  if (!moves.some((m) => m.captured || m.promotion)) return null;
  const balance = balanceOf(final);
  if (balance !== balanceOf(new Chess(fullLine[fullLine.length - 1].after))) return null;
  if ((solver === "w" ? balance : -balance) <= 0) return null;

  const before = pieceCounts(start);
  const after = pieceCounts(final);
  return {
    kind: "material",
    prompt: "After these moves, what material does each side have?",
    hint: "The counts start from the position shown. Adjust them for what changes.",
    start: before,
    answer: after,
    explanation: (["w", "b"] as const).map((c) => describeChange(c, before[c], after[c])).join(" "),
  };
}

/** e.g. "White lost a knight and 2 pawns, and gained a queen." */
function describeChange(color: Color, before: PieceCounts, after: PieceCounts): string {
  const phrase = (t: MaterialType, n: number) => (n === 1 ? `a ${PIECE_NAMES[t]}` : `${n} ${PIECE_NAMES[t]}s`);
  const list = (items: string[]) =>
    items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  const lost = MATERIAL_TYPES.filter((t) => after[t] < before[t]).map((t) => phrase(t, before[t] - after[t]));
  const gained = MATERIAL_TYPES.filter((t) => after[t] > before[t]).map((t) => phrase(t, after[t] - before[t]));
  const parts = [lost.length && `lost ${list(lost)}`, gained.length && `gained ${list(gained)}`].filter(Boolean);
  return parts.length ? `${colorName(color)} ${parts.join(", and ")}.` : `${colorName(color)}'s material is unchanged.`;
}

/**
 * Counts defenders of a piece in the final position. Only asks about pieces
 * that moved during the line, or whose defenders changed, so the answer can't
 * be read off the starting board.
 */
function defendersQuestion({ start, final, moves }: LineContext, rng: Rng): Question | null {
  const touched = new Set(moves.flatMap((m) => [m.from, m.to]));
  const candidates = final
    .board()
    .flat()
    .filter((p) => p !== null && p.type !== "k")
    .filter((p) => {
      const defenders = final.attackers(p!.square, p!.color).length;
      if (touched.has(p!.square)) return true;
      return start.attackers(p!.square, p!.color).length !== defenders;
    });
  if (candidates.length === 0) return null;
  const piece = pick(candidates, rng)!;
  const defenders = final.attackers(piece.square, piece.color);
  const name = `${colorName(piece.color).toLowerCase()} ${PIECE_NAMES[piece.type]}`;
  const list = defenders.map((sq) => `the ${PIECE_NAMES[final.get(sq)!.type]} on ${sq}`);
  const listed = list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return {
    kind: "defenders",
    prompt: `After these moves, how many pieces defend the ${name} on ${piece.square}?`,
    hint: `Count every ${colorName(piece.color)} piece that attacks ${piece.square}, including the king. Ignore pins.`,
    square: piece.square,
    answer: defenders.length,
    explanation:
      defenders.length === 0
        ? `Nothing defends the ${name} on ${piece.square}.`
        : `The ${name} on ${piece.square} is defended by ${listed}.`,
  };
}

function pieceLocationQuestion(startFen: string, moves: Move[], rng: Rng): Question | null {
  const pieces = trackPieces(startFen, moves);
  // A piece's fate after a single step can be read off the notation ("Nd2",
  // or "gxf3" for one captured where it stood). It takes a second step to
  // need visualising: moving twice, or moving and then being captured.
  const pool = pieces.filter((p) => p.timesMoved >= 2 || (p.square === null && p.timesMoved >= 1));
  if (pool.length === 0) return null;
  const piece = pick(pool, rng);
  const name = `${colorName(piece.color)} ${PIECE_NAMES[piece.type]}`;
  return {
    kind: "pieceLocation",
    prompt: `Where is the ${name} that started on ${piece.start} now?`,
    hint: "Click its square, or choose Captured.",
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

function moveLegalityQuestion({ start, final, moves }: LineContext, rng: Rng): Question | null {
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

function buildQuestion(kind: QuestionKind, ctx: LineContext, rng: Rng): Question | null {
  switch (kind) {
    case "material":
      return materialQuestion(ctx);
    case "defenders":
      return defendersQuestion(ctx, rng);
    case "pieceLocation":
      return pieceLocationQuestion(ctx.start.fen(), ctx.moves, rng);
    case "moveLegality":
      return moveLegalityQuestion(ctx, rng);
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
  // Some kinds suit only a minority of puzzles (material: ~1 in 4), and
  // attempts take well under a millisecond, so try plenty.
  for (let attempt = 0; attempt < 300; attempt++) {
    const [puzzleId, startFen, uci, rating, goal] = pick(pool, rng);
    const fullLine = playUci(startFen, uci.split(" "));
    const moves = fullLine.slice(0, plies);
    const solver: Color = startFen.split(" ")[1] === "w" ? "b" : "w";
    const ctx: LineContext = {
      start: new Chess(startFen),
      final: new Chess(moves[moves.length - 1].after),
      moves,
      fullLine,
      goal,
      solver,
    };
    for (const kind of shuffle(kinds, rng)) {
      const question = buildQuestion(kind, ctx, rng);
      if (!question) continue;
      return {
        puzzleId,
        rating,
        orientation: solver,
        startFen,
        moves: moves.map((m) => ({ san: m.san, from: m.from, to: m.to, fenAfter: m.after })),
        finalFen: moves[moves.length - 1].after,
        question,
      };
    }
  }
  throw new Error("Could not generate an exercise; try different settings");
}
