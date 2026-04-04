"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { shortenAddress } from "@/lib/format";
import { Spinner } from "@/components/Spinner";
import { TxItem } from "@/components/TxItem";

interface Balance {
  token: string;
  symbol: string;
  amount: string;
  formatted: string;
  network: string;
  type: string;
}

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

export default function DashboardHome() {
  const { account, address, username, logout, network, setNetwork } = useWallet();
  const router = useRouter();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    async function load() {
      setLoading(true);
      const [balRes, txRes] = await Promise.all([
        fetch(`/api/balance?address=${address}`).then((r) => r.json()),
        fetch(`/api/history?address=${address}`).then((r) => r.json()),
      ]);
      setBalances(balRes.balances ?? []);
      setTransactions(txRes.transactions ?? []);
      setLoading(false);
    }
    load();
  }, [address]);

  useEffect(() => {
    if (!account && !address) {
      router.replace("/");
    }
  }, [account, address, router]);

  if (!account || !address) {
    return null;
  }

  function copyAddress() {
    navigator.clipboard.writeText(address!);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Filter balances by selected network
  const networkBalances = balances.filter((b) => b.network === network);
  const usdcBalance = networkBalances.find((b) => b.symbol === "USDC" && b.type === "onchain");
  const poolBalance = networkBalances.find((b) => b.type === "pool");

  // Filter transactions by network
  const networkTxs = transactions.filter((t) => t.network === network);

  return (
    <div className="flex flex-col px-5 pt-6 pb-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-secondary text-sm">Hi, {username}</p>
          <button onClick={copyAddress} className="text-xs text-tertiary font-mono mt-0.5">
            {copied ? "Copied!" : shortenAddress(address)}
          </button>
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/");
          }}
          className="text-sm text-secondary hover:text-primary transition-colors"
        >
          Sign Out
        </button>
      </div>

      {/* Network Toggle */}
      <div className="flex bg-elevated rounded-2xl p-1">
        <button
          onClick={() => setNetwork("mainnet")}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
            network === "mainnet"
              ? "bg-accent text-white"
              : "text-secondary"
          }`}
        >
          Mainnet
        </button>
        <button
          onClick={() => setNetwork("testnet")}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
            network === "testnet"
              ? "bg-accent text-white"
              : "text-secondary"
          }`}
        >
          Testnet
        </button>
      </div>

      {/* Balance Card */}
      <div className="rounded-3xl bg-card p-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner size={24} />
          </div>
        ) : (
          <>
            {/* USDC Balance */}
            <div className="text-center">
              <p className="text-secondary text-xs uppercase tracking-wider mb-1">
                USDC · {network === "mainnet" ? "Base" : "Base Sepolia"}
              </p>
              <p className="text-4xl font-bold">
                {usdcBalance?.formatted ?? "0"}
                <span className="text-lg text-secondary ml-1">USDC</span>
              </p>
            </div>

            {/* Pool Balance (testnet only) */}
            {network === "testnet" && poolBalance && poolBalance.amount !== "0" && (
              <div className="border-t border-line pt-3 text-center">
                <p className="text-tertiary text-xs">Privacy Pool</p>
                <p className="text-lg font-semibold">
                  {poolBalance.formatted}
                  <span className="text-sm text-secondary ml-1">{poolBalance.symbol}</span>
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        {network === "testnet" ? (
          <button
            onClick={() => router.push("/dashboard/send")}
            className="h-12 rounded-2xl bg-accent text-white font-semibold text-sm hover:bg-accent-hover transition-colors"
          >
            Send Privately
          </button>
        ) : (
          <button
            onClick={() => router.push("/dashboard/pay")}
            className="h-12 rounded-2xl bg-accent text-white font-semibold text-sm hover:bg-accent-hover transition-colors"
          >
            Pay Merchant
          </button>
        )}
        <button
          onClick={() => router.push("/dashboard/history")}
          className="h-12 rounded-2xl bg-elevated text-primary font-semibold text-sm hover:bg-line transition-colors"
        >
          History
        </button>
      </div>

      {/* Recent Transactions */}
      <div>
        <h2 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3">
          Recent
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : networkTxs.length === 0 ? (
          <p className="text-center text-tertiary text-sm py-8">
            No {network} transactions yet
          </p>
        ) : (
          <div className="divide-y divide-line">
            {networkTxs.slice(0, 5).map((tx) => (
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
    </div>
  );
}
