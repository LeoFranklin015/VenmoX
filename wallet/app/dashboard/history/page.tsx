"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { TxItem } from "@/components/TxItem";
import { Spinner } from "@/components/Spinner";

interface Transaction {
  id: number;
  type: string;
  network: string;
  status: string;
  amount: string | null;
  token: string | null;
  recipient: string | null;
  tx_hash: string | null;
  created_at: string;
}

export default function HistoryPage() {
  const { address } = useWallet();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "testnet" | "mainnet">("all");

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/history?address=${address}`)
      .then((r) => r.json())
      .then((data) => setTransactions(data.transactions ?? []))
      .finally(() => setLoading(false));
  }, [address]);

  const filtered =
    filter === "all"
      ? transactions
      : transactions.filter((t) => t.network === filter);

  return (
    <div className="flex flex-col px-5 pt-6 pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-accent text-sm font-medium">
          Back
        </button>
        <h1 className="text-lg font-semibold">History</h1>
        <div className="w-10" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "testnet", "mainnet"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? "bg-accent text-white"
                : "bg-elevated text-secondary"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-tertiary text-sm py-16">No transactions</p>
      ) : (
        <div className="divide-y divide-line">
          {filtered.map((tx) => (
            <TxItem
              key={tx.id}
              type={tx.type}
              network={tx.network}
              status={tx.status}
              amount={tx.amount}
              token={tx.token}
              recipient={tx.recipient}
              createdAt={tx.created_at}
            />
          ))}
        </div>
      )}
    </div>
  );
}
