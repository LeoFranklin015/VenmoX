"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { getPayClient } from "@/lib/walletconnect-pay";
import { Spinner } from "@/components/Spinner";
import { formatTokenAmount } from "@/lib/format";

type PayStep =
  | "input"
  | "fetching"
  | "fund_burner"
  | "funding"
  | "options"
  | "signing"
  | "confirming"
  | "success"
  | "error";

export default function PayPage() {
  const { account, address } = useWallet();
  const router = useRouter();

  const [paymentLink, setPaymentLink] = useState("");
  const [step, setStep] = useState<PayStep>("input");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [options, setOptions] = useState<any[]>([]);
  const [burnerAddress, setBurnerAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<string | null>(null);

  function reset() {
    setStep("input");
    setPaymentLink("");
    setPaymentId(null);
    setPaymentInfo(null);
    setOptions([]);
    setBurnerAddress(null);
    setError(null);
    setTxResult(null);
  }

  // Step 1: Create burner + fetch payment options
  async function handleFetch() {
    if (!paymentLink.trim() || !address) return;
    setStep("fetching");
    setError(null);

    try {
      // Create a burner wallet for this payment
      const burnerRes = await fetch("/api/burner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: address,
          token: "USDC",
          amount: "0",
        }),
      });
      const burnerData = await burnerRes.json();
      if (burnerData.error) throw new Error(burnerData.error);
      setBurnerAddress(burnerData.burnerAddress);

      // Use burner address for CAIP-10 accounts
      const burner = burnerData.burnerAddress;
      const caip10 = [
        `eip155:1:${burner}`,
        `eip155:8453:${burner}`,
        `eip155:10:${burner}`,
        `eip155:137:${burner}`,
        `eip155:42161:${burner}`,
      ];

      const client = getPayClient();
      const result = await client.getPaymentOptions({
        paymentLink: paymentLink.trim(),
        accounts: caip10,
        includePaymentInfo: true,
      });

      setPaymentId(result.paymentId);
      setPaymentInfo(result.info ?? null);
      setOptions(result.options ?? []);

      // Show fund burner step (need to send USDC to burner first)
      setStep("fund_burner");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch payment");
      setStep("error");
    }
  }

  // Step 2: Fund burner from main JAW account
  async function handleFundBurner() {
    if (!account || !burnerAddress || !paymentInfo) return;
    setStep("funding");
    setError(null);

    try {
      // Calculate USDC amount from payment info
      const amountValue = paymentInfo.amount?.value ?? "0";
      const decimals = paymentInfo.amount?.display?.decimals ?? 2;
      const padded = amountValue.padStart(decimals + 1, "0");
      const usdcWhole = padded.slice(0, -decimals) || "0";
      const usdcFrac = padded.slice(-decimals);
      const usdcAmount = `${usdcWhole}.${usdcFrac}`;

      // USDC on Base has 6 decimals
      const usdcRaw = BigInt(Math.ceil(parseFloat(usdcAmount) * 1e6));
      const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

      // Encode ERC-20 transfer(address, uint256)
      const selector = "0xa9059cbb";
      const paddedTo = burnerAddress.slice(2).padStart(64, "0");
      const paddedAmount = usdcRaw.toString(16).padStart(64, "0");
      const calldata =
        `${selector}${paddedTo}${paddedAmount}` as `0x${string}`;

      // Send USDC from JAW smart account to burner
      await account.sendTransaction([{ to: USDC_BASE, data: calldata }]);

      // Re-fetch options now that burner has USDC
      const client = getPayClient();
      const caip10 = [
        `eip155:1:${burnerAddress}`,
        `eip155:8453:${burnerAddress}`,
        `eip155:10:${burnerAddress}`,
        `eip155:137:${burnerAddress}`,
        `eip155:42161:${burnerAddress}`,
      ];

      const result = await client.getPaymentOptions({
        paymentLink: paymentLink.trim(),
        accounts: caip10,
        includePaymentInfo: true,
      });

      setOptions(result.options ?? []);

      if (result.options && result.options.length > 0) {
        setStep("options");
      } else {
        setError("Burner funded but no payment options available.");
        setStep("error");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fund burner");
      setStep("error");
    }
  }

  // Step 3: Select option, sign, confirm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelectOption = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (option: any) => {
      if (!paymentId) return;
      setStep("signing");
      setError(null);

      try {
        const client = getPayClient();
        const actions = await client.getRequiredPaymentActions({
          paymentId,
          optionId: option.id,
        });

        // For now, sign with main account
        // In production: sign with burner private key via viem
        const signatures: string[] = [];
        if (account) {
          for (const action of actions) {
            const { method, params } = action.walletRpc;
            const parsedParams = JSON.parse(params);

            let sig: string;
            switch (method) {
              case "eth_signTypedData_v4": {
                const typedData =
                  typeof parsedParams[1] === "string"
                    ? JSON.parse(parsedParams[1])
                    : parsedParams[1];
                sig = await account.signTypedData(typedData);
                break;
              }
              case "eth_sendTransaction": {
                const tx = parsedParams[0] as {
                  to: string;
                  value?: string;
                  data?: string;
                };
                const hash = await account.sendTransaction([
                  {
                    to: tx.to as `0x${string}`,
                    value: tx.value ? BigInt(tx.value) : undefined,
                    data: tx.data as `0x${string}` | undefined,
                  },
                ]);
                sig = hash;
                break;
              }
              case "personal_sign": {
                sig = await account.signMessage(parsedParams[0] as string);
                break;
              }
              default: {
                const fallback =
                  typeof parsedParams[1] === "string"
                    ? JSON.parse(parsedParams[1])
                    : parsedParams[1];
                sig = await account.signTypedData(fallback);
              }
            }
            signatures.push(sig);
          }
        }

        setStep("confirming");
        let result = await client.confirmPayment({
          paymentId,
          optionId: option.id,
          signatures,
        });

        while (!result.isFinal && result.pollInMs) {
          await new Promise((r) => setTimeout(r, result.pollInMs!));
          result = await client.confirmPayment({
            paymentId,
            optionId: option.id,
            signatures,
          });
        }

        if (result.status === "succeeded") {
          setTxResult(result.info?.txId ?? paymentId);
          setStep("success");
        } else {
          setError(`Payment ${result.status}`);
          setStep("error");
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Payment failed");
        setStep("error");
      }
    },
    [paymentId, account, paymentLink]
  );

  return (
    <div className="flex flex-col px-5 pt-6 pb-4 space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="text-accent text-sm font-medium"
        >
          Back
        </button>
        <h1 className="text-lg font-semibold">Pay Merchant</h1>
        <div className="w-10" />
      </div>

      {step === "input" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-card p-4 text-center">
            <p className="text-xs text-secondary mb-1 uppercase tracking-wider">
              Mainnet
            </p>
            <p className="text-tertiary text-xs">
              Base · WalletConnect Pay via Burner
            </p>
          </div>
          <input
            type="text"
            value={paymentLink}
            onChange={(e) => setPaymentLink(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            placeholder="Paste payment link..."
            className="w-full h-14 rounded-2xl bg-elevated border border-line px-4 text-primary font-mono text-sm placeholder:text-tertiary focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleFetch}
            disabled={!paymentLink.trim()}
            className="w-full h-14 rounded-2xl bg-accent text-white text-base font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40"
          >
            Fetch Payment
          </button>
        </div>
      )}

      {step === "fetching" && <CenterSpinner text="Fetching payment..." />}

      {step === "fund_burner" && paymentInfo && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-secondary">Payment from</p>
          <p className="text-xl font-bold">
            {paymentInfo.merchant?.name ?? "Merchant"}
          </p>
          <p className="text-3xl font-bold">
            $
            {formatTokenAmount(
              paymentInfo.amount?.value ?? "0",
              paymentInfo.amount?.display?.decimals ?? 2
            )}
          </p>
          <div className="rounded-2xl bg-card p-4 text-left space-y-2">
            <p className="text-xs text-secondary">How it works:</p>
            <p className="text-xs text-tertiary">
              1. Your USDC is sent to a temporary burner wallet
            </p>
            <p className="text-xs text-tertiary">
              2. The burner pays the merchant via WalletConnect
            </p>
            <p className="text-xs text-tertiary">
              3. The burner is disposed — no link to your account
            </p>
          </div>
          <button
            onClick={handleFundBurner}
            className="w-full h-14 rounded-2xl bg-accent text-white text-base font-semibold hover:bg-accent-hover transition-colors"
          >
            Approve & Pay
          </button>
          <button onClick={reset} className="text-sm text-secondary">
            Cancel
          </button>
        </div>
      )}

      {step === "funding" && <CenterSpinner text="Funding burner wallet..." />}

      {step === "options" && (
        <div className="space-y-3">
          <p className="text-sm text-secondary">Select payment method:</p>
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleSelectOption(opt)}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-elevated hover:bg-line transition-colors text-left"
            >
              <div>
                <p className="font-medium text-primary">
                  {opt.amount?.display?.assetSymbol ?? "Token"} on{" "}
                  {opt.amount?.display?.networkName ?? "Unknown"}
                </p>
                <p className="text-xs text-tertiary">~{opt.etaS ?? "?"}s</p>
              </div>
              <p className="font-mono text-sm text-primary">
                {formatTokenAmount(
                  opt.amount?.value ?? "0",
                  opt.amount?.display?.decimals ?? 2
                )}
              </p>
            </button>
          ))}
          <button onClick={reset} className="w-full text-sm text-secondary">
            Cancel
          </button>
        </div>
      )}

      {step === "signing" && <CenterSpinner text="Signing with burner..." />}
      {step === "confirming" && (
        <CenterSpinner text="Confirming payment..." />
      )}

      {step === "success" && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green/10 text-green flex items-center justify-center text-3xl">
            ✓
          </div>
          <p className="text-xl font-bold">Paid!</p>
          {txResult && (
            <p className="text-xs text-tertiary font-mono break-all">
              ID: {txResult}
            </p>
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
          <div className="w-16 h-16 rounded-full bg-red/10 text-red flex items-center justify-center text-3xl">
            ✕
          </div>
          <p className="text-xl font-bold">Failed</p>
          <p className="text-red text-sm">{error}</p>
          <button
            onClick={reset}
            className="mt-4 h-12 px-8 rounded-2xl bg-elevated text-primary font-medium text-sm"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

function CenterSpinner({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-3">
      <Spinner size={32} />
      <p className="text-secondary text-sm">{text}</p>
    </div>
  );
}
