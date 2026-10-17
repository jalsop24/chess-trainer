/** A circular progress ring for today's goal; fills to 100% and glows once met. */
export function GoalRing({ value, goal, size = 28 }: { value: number; goal: number; size?: number }) {
  const stroke = size >= 48 ? 6 : 3.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.min(value / goal, 1);
  const done = value >= goal;
  return (
    <svg
      className={`goal-ring${done ? " goal-ring--done" : ""}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${Math.min(value, goal)} of ${goal} correct today`}
    >
      <circle className="goal-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
      <circle
        className="goal-ring__fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
