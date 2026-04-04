import { ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { timeAgo } from "@/lib/format";

interface TxItemProps {
  type: string;
  network: string;
  status: string;
  amount: string | null;
  token: string | null;
  recipient: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  transfer: "Private Send",
  "wc-pay": "Payment",
  "burner-fund": "Fund",
  send: "Send",
};

export function TxItem({ type, status, amount, createdAt }: TxItemProps) {
  const label = TYPE_LABELS[type] ?? type;
  const isOutgoing = ["transfer", "send", "wc-pay"].includes(type);
  const isPending = ["pending", "processing", "signing"].includes(status);

  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
          {isOutgoing ? (
            <ArrowUpRight size={15} className="text-white/40" />
          ) : (
            <ArrowDownLeft size={15} className="text-[#8dd885]" />
          )}
        </div>
        <div>
          <p className="text-[13px] font-medium text-white">{label}</p>
          <p className="text-[10px] text-white/25 mt-0.5">
            {isPending ? status : timeAgo(createdAt)}
          </p>
        </div>
      </div>
      {amount && (
        <p className={`text-[13px] font-semibold tabular-nums ${
          isOutgoing ? "text-white" : "text-[#8dd885]"
        }`}>
          {isOutgoing ? "-" : "+"}{amount}
        </p>
      )}
    </div>
  );
}
