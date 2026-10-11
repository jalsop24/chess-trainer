import type { Color, PieceSymbol } from "chess.js";

// cburnett pieces (see src/assets/pieces/README.md), keyed like "wK", "bN".
const PIECE_URLS = Object.fromEntries(
  Object.entries(import.meta.glob<string>("../assets/pieces/*.svg", { eager: true, query: "?url", import: "default" })).map(
    ([path, url]) => [path.match(/(\w+)\.svg$/)![1], url],
  ),
);

export function pieceUrl(color: Color, type: PieceSymbol): string {
  return PIECE_URLS[`${color}${type.toUpperCase()}`];
}
