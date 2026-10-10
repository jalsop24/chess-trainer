import { useState } from "react";
import type { Color, Square } from "chess.js";
import { Board } from "./Board";
import type { Question } from "../lib/exercise";

export type AnswerValue = number | boolean | Square | "captured";

interface AnswerInputProps {
  question: Question;
  orientation: Color;
  onSubmit: (value: AnswerValue) => void;
}

const EMPTY_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";

export function AnswerInput({ question, orientation, onSubmit }: AnswerInputProps) {
  switch (question.kind) {
    case "material":
      return <NumberAnswer label="Material balance" placeholder="e.g. +3, 0, -2" onSubmit={onSubmit} />;
    case "defenders":
      return <NumberAnswer label="Number of defenders" placeholder="e.g. 2" onSubmit={onSubmit} />;
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

interface NumberAnswerProps {
  label: string;
  placeholder: string;
  onSubmit: (v: number) => void;
}

function NumberAnswer({ label, placeholder, onSubmit }: NumberAnswerProps) {
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
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={label}
      />
      <button type="submit" className="primary" disabled={!valid}>Submit</button>
    </form>
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
    case "defenders":
      return String(value);
    case "pieceLocation":
      return value === "captured" ? "Captured" : String(value);
    case "moveLegality":
      return value ? "Yes" : "No";
  }
}
