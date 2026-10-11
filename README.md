# Chess Visualisation Trainer

A trainer for calculation and visualisation. It shows a position from a real
game and a sequence of moves, then asks a question about the resulting position,
which you answer without moving the pieces. For example: *"Nxe4 dxe4 — what is
the material balance now?"*

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer (developed on Node 22)
- npm (bundled with Node)

## Running locally

```sh
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Then open http://localhost:5173. Each exercise shows the start position, a
move sequence and a question. After you answer, you can replay the line on the
board with the ◀ ▶ buttons or the arrow keys, and press Enter for the next
exercise. The settings button in the top right changes the sequence length
(2–10 half-moves) and which question types appear; changes apply from the next
exercise. Your score is saved in the browser.

Other commands:

| Command           | What it does                                       |
| ----------------- | -------------------------------------------------- |
| `npm test`        | Run the test suite once (takes a few seconds)      |
| `npm run build`   | Type-check and build a production bundle to `dist/` |
| `npm run preview` | Serve the production build locally                 |

## How exercises are generated

Positions and move sequences come from the
[Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0). Each
puzzle is a position from a real game, plus the opponent's move that set up the
puzzle and the best continuation.

1. **Pick a puzzle** from `public/puzzles.json` whose line is at least as long
   as the chosen sequence length, and cut the line to that length.
2. **Show the game position** before the setup move, with the board oriented
   for the side solving the puzzle.
3. **Ask a question** about the position after the sequence
   (`src/lib/exercise.ts`):
   - **Material count:** how many queens, rooks, bishops, knights and pawns
     each side has. The answer starts filled in with the starting position, so
     the task is working out what changes. Only asked when material reflects
     who is better: the puzzle isn't won by mate, the solving
     side is ahead, and no captures are pending later in the line.
   - **How many defenders:** how many pieces defend a piece that moved, or
     whose defenders changed, during the line.
   - **Where did a piece go:** a square or "captured". Only asked about pieces
     that moved twice, or moved and were then captured, since one move can be
     read straight off the notation.
   - **Is a move legal:** yes or no.

   Questions are chosen so the answer can't be read off the move list or the
   starting board alone.

### Regenerating the puzzle data

`public/puzzles.json` is a sample of about 5,600 popular, well-rated puzzles,
spread across line lengths. To rebuild it (needs `zstd`, e.g.
`brew install zstd`):

```sh
curl -s https://database.lichess.org/lichess_db_puzzle.csv.zst \
  | zstd -dc | node scripts/build-puzzles.mjs > public/puzzles.json
```

The script stops reading once it has enough puzzles, so it only streams a small
part of the roughly 300 MB file. Quotas and quality filters are at the top of
`scripts/build-puzzles.mjs`.

## Tech stack

Vite, React and TypeScript, with [chess.js](https://github.com/jhlywa/chess.js)
for chess rules and notation, and Vitest for tests.

Piece images are the "cburnett" set by Colin M.L. Burnett, used under the BSD
license; see `src/assets/pieces/README.md`.
