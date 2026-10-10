# Chess Visualisation Trainer

A trainer for calculation and visualisation. It shows a realistic chess position
and a sequence of moves, then asks a question about the resulting position,
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
exercise. Use **Settings** to change the sequence length (2–10 half-moves) and
choose which question types appear. Your score is saved in the browser.

Other commands:

| Command           | What it does                                       |
| ----------------- | -------------------------------------------------- |
| `npm test`        | Run the test suite once (takes about 30 seconds)   |
| `npm run build`   | Type-check and build a production bundle to `dist/` |
| `npm run preview` | Serve the production build locally                 |

## How exercises are generated

1. **Starting position:** play one of 24 main-line openings
   (`src/lib/openings.ts`), then up to 7 extra moves chosen by a small built-in
   engine so positions vary.
2. **Move sequence:** the engine plays the requested number of plies, preferring
   captures and checks among reasonable moves (`src/lib/engine.ts`).
3. **Question:** one is generated from the final position
   (`src/lib/exercise.ts`):
   - **Material balance:** White minus Black, in points.
   - **What's on a square:** a piece or "empty".
   - **Where did a piece go:** a square or "captured".
   - **Is a move legal:** yes or no.

Generation runs in a Web Worker (`src/lib/generator.worker.ts`), and the next
exercise is prepared while you work on the current one.

## Tech stack

Vite, React and TypeScript, with [chess.js](https://github.com/jhlywa/chess.js)
for move generation and rules, and Vitest for tests.
