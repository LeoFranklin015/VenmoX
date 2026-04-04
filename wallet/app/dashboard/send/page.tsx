"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { AmountInput } from "@/components/AmountInput";
import { Spinner } from "@/components/Spinner";
import { ArrowLeft } from "lucide-react";

const TESTNET_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

type SendStep = "amount" | "preparing" | "funding_ephemeral" | "executing" | "success" | "error";

export default function SendPage() {
  const { address, getTestnetAccount } = useWallet();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [step, setStep] = useState<SendStep>("amount");
  const [statusMsg, setStatusMsg] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!amount || !recipient || !address) return;
    setError(null);

    try {
      setStep("preparing");
      setStatusMsg("Preparing...");
      const testnetAccount = await getTestnetAccount();
      if (!testnetAccount) throw new Error("Could not restore testnet account.");

      setStatusMsg("Creating ephemeral wallet...");
      const prepRes = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "prepare", ownerAddress: address, amount }),
      });
      const prepText = await prepRes.text();
      if (!prepText) throw new Error(`Server returned empty response (${prepRes.status})`);
      const prepData = JSON.parse(prepText);
      if (prepData.error) throw new Error(prepData.error);

      const { ephemeralAddress, amountRaw } = prepData;

      setStep("funding_ephemeral");
      setStatusMsg("Sending USDC (passkey)...");

      const selector = "0xa9059cbb";
      const paddedTo = ephemeralAddress.slice(2).padStart(64, "0");
      const paddedAmt = BigInt(amountRaw).toString(16).padStart(64, "0");
      const calldata = `${selector}${paddedTo}${paddedAmt}` as `0x${string}`;

      await testnetAccount.sendTransaction([
        { to: TESTNET_USDC as `0x${string}`, data: calldata },
      ]);

      setStatusMsg("Waiting for confirmation...");
      await new Promise((r) => setTimeout(r, 10000));

      setStep("executing");
      setStatusMsg("Routing through privacy pool...");

      const execRes = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "execute",
          ownerAddress: address,
          recipientAddress: recipient,
          amount,
          ephemeralAddress,
        }),
      });
      const execText = await execRes.text();
      if (!execText) throw new Error(`Server returned empty response (${execRes.status})`);
      const execData = JSON.parse(execText);
      if (execData.error) throw new Error(execData.error);

      setTxHash(execData.txHash);
      setStep("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transfer failed");
      setStep("error");
    }
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto w-full min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center cursor-pointer hover:bg-white/[0.1] transition-colors">
          <ArrowLeft size={18} className="text-white/60" />
        </button>
        <p className="text-[16px] font-semibold text-white">Send Privately</p>
        <div className="w-9" />
      </div>

      {/* Amount + Recipient + Numpad */}
      {step === "amount" && (
        <div className="flex-1 flex flex-col px-5">
          {/* Recipient — near top */}
          <div className="pt-2">
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Recipient address 0x..."
              className="w-full h-[46px] rounded-2xl bg-white/[0.06] border border-white/5 px-4 text-[13px] text-white font-mono placeholder:text-white/20 focus:outline-none focus:border-mint/30 transition-colors"
            />
          </div>

          {/* Amount display — centered in remaining space */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-[48px] font-bold text-white leading-none tabular-nums tracking-tight">
              ${amount || "0"}
            </p>
            <p className="text-[14px] text-white/35 mt-2">USDC</p>
          </div>

          {/* Numpad + Button — bottom */}
          <div className="pb-20">
            <AmountInput value={amount} onChange={setAmount} hideDisplay />
            <div className="pt-3">
              <HoldButton
                onConfirm={handleSend}
                disabled={!amount || parseFloat(amount) <= 0 || !recipient}
                label="Hold to send"
              />
            </div>
          </div>
        </div>
      )}

      {/* Processing steps */}
      {(step === "preparing" || step === "funding_ephemeral" || step === "executing") && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-6">
          <Spinner size={28} />
          <div className="text-center">
            <p className="text-white text-[15px] font-medium">{statusMsg}</p>
            <p className="text-white/25 text-[12px] mt-1">This may take 1-3 minutes</p>
          </div>
          <div className="w-full max-w-[260px] space-y-3">
            <StepRow label="Prepare wallet" done={step !== "preparing"} active={step === "preparing"} />
            <StepRow label="Sign transaction" done={step === "executing"} active={step === "funding_ephemeral"} />
            <StepRow label="Route through pool" done={false} active={step === "executing"} />
          </div>
        </div>
      )}

      {/* Success */}
      {step === "success" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-4">
          <div className="w-16 h-16 rounded-full bg-mint/15 text-mint flex items-center justify-center text-[28px] font-bold">
            ✓
          </div>
          <p className="text-[22px] font-bold text-white">Sent!</p>
          <p className="text-white/40 text-[14px]">${amount} USDC sent privately</p>
          {txHash && (
            <a
              href={`https://sepolia.basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-mint text-[13px] font-medium cursor-pointer"
            >
              View on Explorer
            </a>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 h-[48px] px-8 rounded-full bg-card text-white text-[14px] font-medium cursor-pointer hover:bg-elevated transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* Error */}
      {step === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-4">
          <div className="w-16 h-16 rounded-full bg-red/15 text-red flex items-center justify-center text-[28px]">
            ✕
          </div>
          <p className="text-[22px] font-bold text-white">Failed</p>
          <p className="text-red/80 text-[13px] text-center max-w-[280px]">{error}</p>
          <button
            onClick={() => { setStep("amount"); setError(null); }}
            className="mt-4 h-[48px] px-8 rounded-full bg-card text-white text-[14px] font-medium cursor-pointer hover:bg-elevated transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

function HoldButton({ onConfirm, disabled, label }: { onConfirm: () => void; disabled?: boolean; label: string }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startHold() {
    if (disabled) return;
    setHolding(true);
    setProgress(0);
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / 1200, 1); // 1.2s hold
      setProgress(pct);
      if (pct >= 1) {
        stopHold();
        onConfirm();
      }
    }, 16);
  }

  function stopHold() {
    setHolding(false);
    setProgress(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  return (
    <button
      onMouseDown={startHold}
      onMouseUp={stopHold}
      onMouseLeave={stopHold}
      onTouchStart={startHold}
      onTouchEnd={stopHold}
      disabled={disabled}
      className="w-full h-[54px] rounded-full bg-mint text-mint-text text-[16px] font-semibold disabled:opacity-30 cursor-pointer relative overflow-hidden select-none"
    >
      {/* Progress fill */}
      <div
        className="absolute inset-0 bg-mint-dark/30 rounded-full transition-none"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative z-10">{holding ? "Keep holding..." : label}</span>
    </button>
  );
}

function StepRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
        done ? "bg-mint/20 text-mint" : active ? "bg-white/10 text-white" : "bg-white/5 text-white/20"
      }`}>
        {done ? "✓" : "·"}
      </div>
      <span className={`text-[13px] ${active ? "text-white font-medium" : done ? "text-mint" : "text-white/20"}`}>
        {label}
      </span>
    </div>
  );
}
