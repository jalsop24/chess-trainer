import { useState } from "react";
import type { Color, Square } from "chess.js";
import { Board } from "./Board";
import { pieceUrl } from "./pieces";
import {
  DEFENDERS_MAX,
  MATERIAL_TYPES,
  sameCounts,
  type AnswerValue,
  type MaterialCounts,
  type MaterialType,
  type Question,
} from "../lib/exercise";

interface AnswerInputProps {
  question: Question;
  orientation: Color;
  onSubmit: (value: AnswerValue) => void;
}

const EMPTY_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";

const DEFENDER_CHOICES = Array.from({ length: DEFENDERS_MAX + 1 }, (_, i) => i);

export function AnswerInput({ question, orientation, onSubmit }: AnswerInputProps) {
  switch (question.kind) {
    case "material":
      return <MaterialAnswer start={question.start} onSubmit={onSubmit} />;
    case "defenders":
      return (
        <div className="button-row" role="group" aria-label="Number of defenders">
          {DEFENDER_CHOICES.map((n) => (
            <button key={n} className="button button--square" onClick={() => onSubmit(n)}>
              {n === DEFENDERS_MAX ? `${n}+` : n}
            </button>
          ))}
        </div>
      );
    case "pieceLocation":
      return <SquareAnswer orientation={orientation} onSubmit={onSubmit} />;
    case "moveLegality":
      return (
        <div className="button-row">
          <button className="button" onClick={() => onSubmit(true)}>Yes</button>
          <button className="button" onClick={() => onSubmit(false)}>No</button>
        </div>
      );
  }
}

const SIDES = [
  { color: "w", label: "White" },
  { color: "b", label: "Black" },
] as const;

const PIECE_LABELS: Record<MaterialType, string> = { q: "Queens", r: "Rooks", b: "Bishops", n: "Knights", p: "Pawns" };

const signed = (n: number) => (n > 0 ? `+${n}` : `\u2212${-n}`);

/** Per-piece counters, prefilled from the starting position. */
function MaterialAnswer({ start, onSubmit }: { start: MaterialCounts; onSubmit: (v: MaterialCounts) => void }) {
  const [counts, setCounts] = useState<MaterialCounts>(() => structuredClone(start));
  const change = (color: "w" | "b", type: MaterialType, delta: number) =>
    setCounts((c) => ({ ...c, [color]: { ...c[color], [type]: Math.max(0, c[color][type] + delta) } }));
  const unchanged = sameCounts(counts, start);

  return (
    <div className="material-answer">
      {SIDES.map(({ color, label }) => (
        <div key={color} className="material-side">
          <div className="material-side__label">{label}</div>
          <div className="material-row">
            {MATERIAL_TYPES.map((type) => {
              const n = counts[color][type];
              const diff = n - start[color][type];
              const name = `${label} ${PIECE_LABELS[type].toLowerCase()}`;
              return (
                <div key={type} className={`counter${diff !== 0 ? " counter--changed" : ""}`}>
                  <img className="counter__piece" src={pieceUrl(color, type)} alt={PIECE_LABELS[type]} />
                  <div className="counter__value" aria-live="polite" aria-label={`${name}: ${n}`}>
                    {n}
                    {diff !== 0 && <span className="counter__diff">{signed(diff)}</span>}
                  </div>
                  <div className="counter__buttons">
                    <button aria-label={`Fewer ${name}`} disabled={n === 0} onClick={() => change(color, type, -1)}>
                      −
                    </button>
                    <button aria-label={`More ${name}`} onClick={() => change(color, type, 1)}>
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="button-row">
        <button className="button button--primary" onClick={() => onSubmit(counts)}>
          {unchanged ? "Submit (no change)" : "Submit"}
        </button>
        <button className="button" disabled={unchanged} onClick={() => setCounts(structuredClone(start))}>
          Reset
        </button>
      </div>
    </div>
  );
}

/** The correct counts after a material question, flagging any the user got wrong. */
export function MaterialComparison({ answer, given }: { answer: MaterialCounts; given: MaterialCounts }) {
  return (
    <div className="material-answer material-answer--result">
      {SIDES.map(({ color, label }) => (
        <div key={color} className="material-side">
          <div className="material-side__label">{label}</div>
          <div className="material-row">
            {MATERIAL_TYPES.map((type) => {
              const right = answer[color][type];
              const theirs = given[color][type];
              return (
                <div key={type} className={`counter${theirs !== right ? " counter--wrong" : ""}`}>
                  <img className="counter__piece" src={pieceUrl(color, type)} alt={PIECE_LABELS[type]} />
                  <div className="counter__value">{right}</div>
                  {theirs !== right && <div className="counter__yours">you: {theirs}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
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
      <div className="button-row">
        <button className="button button--primary" disabled={!selected} onClick={() => selected && onSubmit(selected)}>
          {selected ? `Submit ${selected}` : "Pick a square"}
        </button>
        <button className="button" onClick={() => onSubmit("captured")}>Captured</button>
      </div>
    </div>
  );
}

export function formatAnswer(question: Question, value: AnswerValue): string {
  switch (question.kind) {
    case "material":
      // Counts don't fit in one line; App shows a MaterialComparison instead.
      return "";
    case "defenders":
      return value === DEFENDERS_MAX ? `${DEFENDERS_MAX}+` : String(value);
    case "pieceLocation":
      return value === "captured" ? "Captured" : String(value);
    case "moveLegality":
      return value ? "Yes" : "No";
  }
}
