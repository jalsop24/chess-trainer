import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

// Filled glyphs for both colours (styled via CSS); ︎ stops iOS rendering
// the pawn as an emoji.
const GLYPHS: Record<PieceSymbol, string> = {
  k: "♚︎",
  q: "♛︎",
  r: "♜︎",
  b: "♝︎",
  n: "♞︎",
  p: "♟︎",
};

export function pieceGlyph(type: PieceSymbol): string {
  return GLYPHS[type];
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

interface BoardProps {
  fen: string;
  orientation: Color;
  /** Draw an empty board (for "click the square" answers). */
  hidePieces?: boolean;
  highlight?: Square[];
  selected?: Square | null;
  onSquareClick?: (square: Square) => void;
}

export function Board({ fen, orientation, hidePieces, highlight = [], selected, onSquareClick }: BoardProps) {
  // Skip validation so king-less placeholder boards (e.g. the empty one) render.
  const chess = new Chess(fen, { skipValidation: true });
  const ranks = orientation === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "w" ? FILES : [...FILES].reverse();

  return (
    <div className={`board${onSquareClick ? " board--clickable" : ""}`} role="grid" aria-label="Chess board">
      {ranks.map((rank, ri) =>
        files.map((file, fi) => {
          const square = `${file}${rank}` as Square;
          const piece = hidePieces ? null : chess.get(square);
          const light = (FILES.indexOf(file) + rank) % 2 === 1;
          const classes = [
            "square",
            light ? "square--light" : "square--dark",
            highlight.includes(square) && "square--highlight",
            selected === square && "square--selected",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={square}
              className={classes}
              role="gridcell"
              aria-label={piece ? `${square} ${piece.color === "w" ? "white" : "black"} ${piece.type}` : square}
              onClick={onSquareClick ? () => onSquareClick(square) : undefined}
            >
              {piece && (
                <span className={`piece piece--${piece.color === "w" ? "white" : "black"}`}>{GLYPHS[piece.type]}</span>
              )}
              {fi === 0 && <span className="coord coord--rank">{rank}</span>}
              {ri === 7 && <span className="coord coord--file">{file}</span>}
            </div>
          );
        }),
      )}
    </div>
  );
}
