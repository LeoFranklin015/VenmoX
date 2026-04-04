"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { AmountInput } from "@/components/AmountInput";
import { Spinner } from "@/components/Spinner";

/**
 * Exact privateTransfer.js flow:
 * 1. Client: JAW sends USDC to ephemeral EVM address (passkey signs)
 * 2. Server: ephemeral approves Permit2 → deposits into pool → creates burner
 *            → funds burner from pool → burner sends to recipient → disposes
 *
 * Result: no on-chain link from JAW address to recipient.
 */

const TESTNET_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

type SendStep = "form" | "preparing" | "funding_ephemeral" | "executing" | "success" | "error";

export default function SendPage() {
  const { address, getTestnetAccount } = useWallet();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [step, setStep] = useState<SendStep>("form");
  const [statusMsg, setStatusMsg] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!amount || !recipient || !address) return;
    setError(null);

    try {
      // Step 1: Get testnet JAW account (Base Sepolia with paymaster)
      setStep("preparing");
      setStatusMsg("Preparing...");
      const testnetAccount = await getTestnetAccount();
      if (!testnetAccount) throw new Error("Could not restore testnet account. Please sign in again.");

      // Step 2: Ask server to create ephemeral EVM address
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

      // Step 3: JAW sends USDC to ephemeral address (passkey prompt)
      setStep("funding_ephemeral");
      setStatusMsg("Sending USDC to ephemeral wallet (passkey)...");

      // Encode ERC-20 transfer(address, uint256)
      const selector = "0xa9059cbb";
      const paddedTo = ephemeralAddress.slice(2).padStart(64, "0");
      const paddedAmt = BigInt(amountRaw).toString(16).padStart(64, "0");
      const calldata = `${selector}${paddedTo}${paddedAmt}` as `0x${string}`;

      await testnetAccount.sendTransaction([
        { to: TESTNET_USDC as `0x${string}`, data: calldata },
      ]);

      // Wait for JAW tx to confirm on-chain
      setStatusMsg("Waiting for USDC transfer to confirm...");
      await new Promise((r) => setTimeout(r, 10000));

      // Step 4: Tell server to execute the full privateTransfer flow
      setStep("executing");
      setStatusMsg("Depositing into privacy pool...");

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
    <div className="flex flex-col px-5 pt-6 pb-4 space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-accent text-sm font-medium">
          Back
        </button>
        <h1 className="text-lg font-semibold">Send Privately</h1>
        <div className="w-10" />
      </div>

      {step === "form" && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-card p-4 text-center">
            <p className="text-xs text-secondary mb-1 uppercase tracking-wider">Testnet</p>
            <p className="text-tertiary text-xs">Base Sepolia · Unlink Privacy Pool</p>
          </div>

          <AmountInput value={amount} onChange={setAmount} symbol="USDC" />

          <div>
            <label className="block text-xs text-secondary mb-1.5 uppercase tracking-wider">
              Recipient Address
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              className="w-full h-14 rounded-2xl bg-elevated border border-line px-4 text-primary font-mono text-sm placeholder:text-tertiary focus:outline-none focus:border-accent"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!amount || !recipient}
            className="w-full h-14 rounded-2xl bg-accent text-white text-base font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40"
          >
            Send Privately
          </button>

          <div className="rounded-2xl bg-card p-4 space-y-2">
            <p className="text-xs text-secondary font-medium">How it works:</p>
            <p className="text-xs text-tertiary">1. USDC sent to a temporary wallet</p>
            <p className="text-xs text-tertiary">2. Temp wallet deposits into privacy pool</p>
            <p className="text-xs text-tertiary">3. Burner funded from pool (link broken)</p>
            <p className="text-xs text-tertiary">4. Burner sends USDC to recipient</p>
            <p className="text-xs text-tertiary">5. Burner disposed — untraceable</p>
          </div>
        </div>
      )}

      {(step === "preparing" || step === "funding_ephemeral" || step === "executing") && (
        <div className="flex flex-col items-center justify-center py-12 space-y-5">
          <Spinner size={32} />
          <p className="text-primary text-sm font-medium">{statusMsg}</p>
          <div className="w-full max-w-xs space-y-3">
            <StepRow label="Create temp wallet" done={step !== "preparing"} active={step === "preparing"} />
            <StepRow label="Send USDC to temp wallet (passkey)" done={step === "executing"} active={step === "funding_ephemeral"} />
            <StepRow label="Fund gas + Approve Permit2" done={false} active={step === "executing"} />
            <StepRow label="Deposit into privacy pool" done={false} active={false} />
            <StepRow label="Burner → Recipient" done={false} active={false} />
          </div>
          <p className="text-tertiary text-xs">This takes 1-3 minutes</p>
        </div>
      )}

      {step === "success" && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green/10 text-green flex items-center justify-center text-3xl">✓</div>
          <p className="text-xl font-bold">Sent Privately!</p>
          <p className="text-secondary text-sm">{amount} USDC sent via privacy pool</p>
          {txHash && (
            <a
              href={`https://sepolia.basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent text-xs font-medium"
            >
              View on Explorer
            </a>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 h-12 px-8 rounded-2xl bg-elevated text-primary font-medium text-sm"
          >
            Done
          </button>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-red/10 text-red flex items-center justify-center text-3xl">✕</div>
          <p className="text-xl font-bold">Failed</p>
          <p className="text-red text-sm">{error}</p>
          <button
            onClick={() => setStep("form")}
            className="mt-4 h-12 px-8 rounded-2xl bg-elevated text-primary font-medium text-sm"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

function StepRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        done ? "bg-green/20 text-green" : active ? "bg-accent/20 text-accent" : "bg-elevated text-tertiary"
      }`}>
        {done ? "✓" : "·"}
      </div>
      <span className={`text-sm ${active ? "text-primary font-medium" : done ? "text-green" : "text-tertiary"}`}>
        {label}
      </span>
    </div>
  );
}
