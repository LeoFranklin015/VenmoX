"use client";

interface AmountInputProps {
  value: string;
  onChange: (val: string) => void;
  symbol: string;
  maxAmount?: string;
}

export function AmountInput({ value, onChange, symbol, maxAmount }: AmountInputProps) {
  return (
    <div className="text-center space-y-2">
      <div className="flex items-center justify-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, "");
            if (v.split(".").length <= 2) onChange(v);
          }}
          placeholder="0"
          className="text-5xl font-bold text-center bg-transparent outline-none w-48 text-primary placeholder:text-tertiary"
        />
        <span className="text-2xl text-secondary font-medium">{symbol}</span>
      </div>
      {maxAmount && (
        <button
          onClick={() => onChange(maxAmount)}
          className="text-xs text-accent font-medium"
        >
          Max: {maxAmount} {symbol}
        </button>
      )}
    </div>
  );
}
