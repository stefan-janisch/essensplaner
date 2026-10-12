import React, { useState } from 'react';

interface ServingsInputProps {
  value: number;
  onChange: (servings: number) => void;
  onSubmit?: () => void;
  style?: React.CSSProperties;
}

const formatServings = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

function parseServings(text: string): number | null {
  const n = parseFloat(text.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

// Text input (not type="number") so German decimal commas like "1,5" work and
// intermediate states such as "0," aren't swallowed while typing.
export const ServingsInput: React.FC<ServingsInputProps> = ({ value, onChange, onSubmit, style }) => {
  const [text, setText] = useState(() => formatServings(value));

  return (
    <input
      className="input"
      type="text"
      inputMode="decimal"
      autoFocus
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseServings(e.target.value);
        if (n !== null) onChange(n);
      }}
      onBlur={() => { if (parseServings(text) === null) setText(formatServings(value)); }}
      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit?.(); }}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      style={style}
    />
  );
};
