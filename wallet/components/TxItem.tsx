import { StatusBadge } from "./StatusBadge";
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
  deposit: "Pool Deposit",
  transfer: "Private Send",
  "wc-pay": "Merchant Payment",
  "burner-fund": "Fund Burner",
  send: "Send",
};

export function TxItem({ type, network, status, amount, createdAt }: TxItemProps) {
  const label = TYPE_LABELS[type] ?? type;
  const isOutgoing = ["transfer", "send", "wc-pay"].includes(type);

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
            isOutgoing ? "bg-red/10 text-red" : "bg-green/10 text-green"
          }`}
        >
          {isOutgoing ? "↑" : "↓"}
        </div>
        <div>
          <p className="text-sm font-medium text-primary">{label}</p>
          <p className="text-xs text-tertiary">
            {network} · {timeAgo(createdAt)}
          </p>
        </div>
      </div>
      <div className="text-right">
        {amount && (
          <p className={`text-sm font-semibold ${isOutgoing ? "text-red" : "text-green"}`}>
            {isOutgoing ? "-" : "+"}{amount}
          </p>
        )}
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
