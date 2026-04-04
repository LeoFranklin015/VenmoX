"use client";

import { Delete } from "lucide-react";

interface AmountInputProps {
  value: string;
  onChange: (val: string) => void;
  symbol?: string;
  balance?: string;
  hideDisplay?: boolean;
}

export function AmountInput({ value, onChange, symbol, balance, hideDisplay }: AmountInputProps) {
  function handleKey(key: string) {
    if (key === "delete") {
      onChange(value.slice(0, -1));
    } else if (key === ".") {
      if (!value.includes(".")) onChange(value + ".");
    } else {
      const parts = (value + key).split(".");
      if (parts[1] && parts[1].length > 6) return;
      onChange(value + key);
    }
  }

  return (
    <div className="flex flex-col items-center w-full">
      {!hideDisplay && (
        <div className="text-center mb-5">
          <p className="text-[40px] font-bold text-white leading-none tabular-nums tracking-tight">
            ${value || "0"}
          </p>
          {symbol && <p className="text-[13px] text-white/35 mt-1.5">{symbol}</p>}
          {balance && (
            <p className="text-[11px] text-white/20 mt-1">Balance: {balance} {symbol}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 w-full">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "delete"].map((key) => (
          <button
            key={key}
            onClick={() => handleKey(key)}
            className="h-[56px] rounded-xl bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/[0.15] active:scale-[0.96] transition-all flex items-center justify-center cursor-pointer"
          >
            {key === "delete" ? (
              <Delete size={20} className="text-white/50" />
            ) : (
              <span className="text-[22px] font-medium text-white/90">{key}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
