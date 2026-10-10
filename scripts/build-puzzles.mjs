// Builds public/puzzles.json from the Lichess puzzle database (CC0):
//
//   curl -s https://database.lichess.org/lichess_db_puzzle.csv.zst \
//     | zstd -dc | node scripts/build-puzzles.mjs > public/puzzles.json
//
// The CSV is sorted by puzzle ID, which is effectively random, so we take the
// first well-rated puzzles in each length bucket and stop reading early.
//
// Each output row is [id, fen, uciMoves, rating, goal]. The FEN is the game
// position before the opponent's move; the moves are that move followed by the
// solution. The goal is the puzzle's outcome theme: "mate", "crushing",
// "advantage" or "equality" (Lichess tags every puzzle with exactly one).

import { createInterface } from "node:readline";

// Wanted puzzles per line length (in half-moves). Longer lines are rare in the
// database but needed for longer sequence settings, so they get a quota too.
const QUOTAS = { 2: 800, 4: 1600, 6: 1400, 8: 1000, 10: 800 }; // 10 = "10 or more"
const MIN_POPULARITY = 85;
const MIN_PLAYS = 500;
const MAX_RATING_DEVIATION = 90;

const FEN_RE = /^[1-8pnbrqkPNBRQK/]+ [wb] (-|[KQkq]+) (-|[a-h][36]) \d+ \d+$/;
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const GOALS = ["mate", "crushing", "advantage", "equality"];

const bucketOf = (n) => Math.min(n, 10);
const counts = Object.fromEntries(Object.keys(QUOTAS).map((k) => [k, 0]));
const rows = [];
let header = null;
let read = 0;

function done() {
  return Object.entries(QUOTAS).every(([k, q]) => counts[k] >= q);
}

function finish() {
  process.stdout.write("[\n" + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n");
  process.stderr.write(`read ${read} rows, kept ${rows.length}: ${JSON.stringify(counts)}\n`);
  process.exit(0);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const cols = line.split(",");
  if (!header) {
    header = Object.fromEntries(cols.map((c, i) => [c, i]));
    return;
  }
  read++;
  const get = (name) => cols[header[name]];
  const fen = get("FEN");
  const moves = get("Moves").split(" ");
  const bucket = bucketOf(moves.length);
  if (!(bucket in QUOTAS) || counts[bucket] >= QUOTAS[bucket]) return;
  if (Number(get("Popularity")) < MIN_POPULARITY) return;
  if (Number(get("NbPlays")) < MIN_PLAYS) return;
  if (Number(get("RatingDeviation")) > MAX_RATING_DEVIATION) return;
  if (!FEN_RE.test(fen) || !moves.every((m) => UCI_RE.test(m))) return;
  const goal = GOALS.find((g) => get("Themes").split(" ").includes(g));
  if (!goal) return;

  rows.push([get("PuzzleId"), fen, moves.join(" "), Number(get("Rating")), goal]);
  counts[bucket]++;
  if (done()) finish();
});
rl.on("close", finish);
