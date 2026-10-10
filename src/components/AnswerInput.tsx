import { useState } from "react";
import type { Color, PieceSymbol, Square } from "chess.js";
import { Board, pieceGlyph } from "./Board";
import { describePiece, type PieceCode, type Question } from "../lib/exercise";

export type AnswerValue = number | boolean | PieceCode | Square | "empty" | "captured";

interface AnswerInputProps {
  question: Question;
  orientation: Color;
  onSubmit: (value: AnswerValue) => void;
}

const EMPTY_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";
const PIECE_ORDER: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];

export function AnswerInput({ question, orientation, onSubmit }: AnswerInputProps) {
  switch (question.kind) {
    case "material":
      return <NumberAnswer onSubmit={onSubmit} />;
    case "squareContents":
      return <PieceAnswer onSubmit={onSubmit} />;
    case "pieceLocation":
      return <SquareAnswer orientation={orientation} onSubmit={onSubmit} />;
    case "moveLegality":
      return (
        <div className="choices">
          <button className="choice" onClick={() => onSubmit(true)}>Yes</button>
          <button className="choice" onClick={() => onSubmit(false)}>No</button>
        </div>
      );
  }
}

function NumberAnswer({ onSubmit }: { onSubmit: (v: number) => void }) {
  const [value, setValue] = useState("");
  const parsed = Number(value.replace("−", "-"));
  const valid = value.trim() !== "" && Number.isInteger(parsed);
  return (
    <form
      className="number-answer"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(parsed);
      }}
    >
      <input
        autoFocus
        inputMode="numeric"
        placeholder="e.g. +3, 0, -2"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Material balance"
      />
      <button type="submit" className="primary" disabled={!valid}>Submit</button>
    </form>
  );
}

function PieceAnswer({ onSubmit }: { onSubmit: (v: PieceCode | "empty") => void }) {
  const row = (color: Color) =>
    PIECE_ORDER.map((type) => {
      const code = `${color}${type}` as PieceCode;
      return (
        <button key={code} className="choice choice--piece" title={describePiece(code)} onClick={() => onSubmit(code)}>
          <span className={`piece piece--${color === "w" ? "white" : "black"}`}>{pieceGlyph(type)}</span>
        </button>
      );
    });
  return (
    <div className="piece-answer">
      <div className="piece-row">{row("w")}</div>
      <div className="piece-row">{row("b")}</div>
      <button className="choice" onClick={() => onSubmit("empty")}>Empty square</button>
    </div>
  );
}

function SquareAnswer({ orientation, onSubmit }: { orientation: Color; onSubmit: (v: Square | "captured") => void }) {
  const [selected, setSelected] = useState<Square | null>(null);
  return (
    <div className="square-answer">
      <div className="mini-board">
        <Board fen={EMPTY_FEN} orientation={orientation} hidePieces selected={selected} onSquareClick={setSelected} />
      </div>
      <div className="choices">
        <button className="primary" disabled={!selected} onClick={() => selected && onSubmit(selected)}>
          {selected ? `Submit ${selected}` : "Pick a square"}
        </button>
        <button className="choice" onClick={() => onSubmit("captured")}>Captured</button>
      </div>
    </div>
  );
}

export function formatAnswer(question: Question, value: AnswerValue): string {
  switch (question.kind) {
    case "material":
      return typeof value === "number" && value > 0 ? `+${value}` : String(value);
    case "squareContents":
      return describePiece(value as PieceCode | "empty");
    case "pieceLocation":
      return value === "captured" ? "Captured" : String(value);
    case "moveLegality":
      return value ? "Yes" : "No";
  }
}
