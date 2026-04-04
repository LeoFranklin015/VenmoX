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
  | "collect_data"
  | "fund_burner"
  | "funding"
  | "options"
  | "signing"
  | "confirming"
  | "success"
  | "error";

interface CollectField {
  id: string;
  name: string;
  required: boolean;
  fieldType: "text" | "date" | "checkbox";
}

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

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

  // Data collection state
  const [collectFields, setCollectFields] = useState<CollectField[]>([]);
  const [collectValues, setCollectValues] = useState<Record<string, string>>({});
  const [collectedData, setCollectedData] = useState<
    { id: string; value: string }[] | null
  >(null);

  function reset() {
    setStep("input");
    setPaymentLink("");
    setPaymentId(null);
    setPaymentInfo(null);
    setOptions([]);
    setBurnerAddress(null);
    setError(null);
    setTxResult(null);
    setCollectFields([]);
    setCollectValues({});
    setCollectedData(null);
  }

  function getCaip10(addr: string) {
    return [
      `eip155:1:${addr}`,
      `eip155:8453:${addr}`,
      `eip155:10:${addr}`,
      `eip155:137:${addr}`,
      `eip155:42161:${addr}`,
    ];
  }

  // Step 1: Fetch payment info using main address, create burner
  async function handleFetch() {
    if (!paymentLink.trim() || !address) return;
    setStep("fetching");
    setError(null);

    try {
      // First: fetch payment info using main address (just to get merchant info + collectData)
      const client = getPayClient();
      const infoResult = await client.getPaymentOptions({
        paymentLink: paymentLink.trim(),
        accounts: getCaip10(address),
        includePaymentInfo: true,
      });

      console.log("[pay] Initial getPaymentOptions:", JSON.stringify(infoResult, null, 2));

      setPaymentId(infoResult.paymentId);
      setPaymentInfo(infoResult.info ?? null);

      // Create burner wallet
      const burnerRes = await fetch("/api/burner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ownerAddress: address, token: "USDC", amount: "0" }),
      });
      const burnerData = await burnerRes.json();
      if (burnerData.error) throw new Error(burnerData.error);
      setBurnerAddress(burnerData.burnerAddress);

      // Check for collectData (Travel Rule compliance)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const topCollect = (infoResult as any).collectData;
      if (topCollect?.fields?.length > 0) {
        setCollectFields(topCollect.fields);
        setStep("collect_data");
      } else {
        setStep("fund_burner");
      }
    } catch (e: unknown) {
      console.error("[pay] handleFetch error:", e);
      setError(e instanceof Error ? e.message : "Failed to fetch payment");
      setStep("error");
    }
  }

  // Submit identity data, then proceed to fund burner
  function handleSubmitCollectData() {
    for (const field of collectFields) {
      if (field.required && !collectValues[field.id]?.trim()) {
        setError(`"${field.name}" is required.`);
        return;
      }
    }
    setError(null);

    const data = [
      ...collectFields.map((f) => ({ id: f.id, value: collectValues[f.id] ?? "" })),
      { id: "tosConfirmed", value: "true" },
    ];
    setCollectedData(data);
    setStep("fund_burner");
  }

  // Step 2: JAW sends USDC to burner, then re-fetch options
  async function handleFundBurner() {
    if (!account || !burnerAddress || !paymentInfo) return;
    setStep("funding");
    setError(null);

    try {
      const amountValue = paymentInfo.amount?.value ?? "0";
      const decimals = paymentInfo.amount?.display?.decimals ?? 2;
      const padded = amountValue.padStart(decimals + 1, "0");
      const usdcWhole = padded.slice(0, -decimals) || "0";
      const usdcFrac = padded.slice(-decimals);
      const usdcFloat = parseFloat(`${usdcWhole}.${usdcFrac}`);

      const usdcRaw = BigInt(Math.ceil(usdcFloat * 1e6));

      const selector = "0xa9059cbb";
      const paddedTo = burnerAddress.slice(2).padStart(64, "0");
      const paddedAmt = usdcRaw.toString(16).padStart(64, "0");
      const calldata = `${selector}${paddedTo}${paddedAmt}` as `0x${string}`;

      await account.sendTransaction([
        { to: USDC_BASE as `0x${string}`, data: calldata },
      ]);

      await new Promise((r) => setTimeout(r, 10000));

      // Re-fetch options with burner address (now has USDC)
      try {
        const client = getPayClient();
        const result = await client.getPaymentOptions({
          paymentLink: paymentLink.trim(),
          accounts: getCaip10(burnerAddress),
          includePaymentInfo: true,
        });

        console.log("[pay] Re-fetch options:", JSON.stringify(result, null, 2));
        setOptions(result.options ?? []);

        if (result.options && result.options.length > 0) {
          setStep("options");
        } else {
          setError("No payment options found. Funds may not have arrived yet.");
          setStep("error");
        }
      } catch (refetchErr) {
        console.error("[pay] Re-fetch options failed:", refetchErr);
        setError("Failed to fetch options after funding. Try again.");
        setStep("error");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fund burner");
      setStep("error");
    }
  }

  // Step 3: Sign with burner + confirm (include collectedData)
  const handleSelectOption = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (option: any) => {
      if (!paymentId || !burnerAddress || !address) return;

      // Check per-option collectData
      if (!collectedData && option.collectData?.fields?.length > 0) {
        setCollectFields(option.collectData.fields);
        setStep("collect_data");
        return;
      }

      setStep("signing");
      setError(null);

      try {
        const client = getPayClient();

        const actions = await client.getRequiredPaymentActions({
          paymentId,
          optionId: option.id,
        });

        console.log("[pay] Actions to sign:", actions.length);

        // Server signs with burner key
        const signRes = await fetch("/api/burner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sign",
            ownerAddress: address,
            burnerAddress,
            actions,
          }),
        });
        const signText = await signRes.text();
        if (!signText) throw new Error(`Sign endpoint returned empty (${signRes.status})`);
        const signData = JSON.parse(signText);
        if (signData.error) throw new Error(signData.error);

        const { signatures } = signData;
        console.log("[pay] Got", signatures.length, "signatures");

        // confirmPayment — include collectedData if we have it
        setStep("confirming");
        const confirmParams: {
          paymentId: string;
          optionId: string;
          signatures: string[];
          collectedData?: { id: string; value: string }[];
        } = {
          paymentId,
          optionId: option.id,
          signatures,
        };
        if (collectedData && collectedData.length > 0) {
          confirmParams.collectedData = collectedData;
        }

        console.log("[pay] Confirm params:", JSON.stringify(confirmParams, null, 2));

        let result = await client.confirmPayment(confirmParams);
        console.log("[pay] Confirm:", result.status, "isFinal:", result.isFinal);

        while (!result.isFinal && result.pollInMs) {
          await new Promise((r) => setTimeout(r, result.pollInMs!));
          result = await client.confirmPayment(confirmParams);
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
    [paymentId, burnerAddress, address, collectedData, paymentLink]
  );

  return (
    <div className="flex flex-col px-5 pt-6 pb-4 space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-accent text-sm font-medium">
          Back
        </button>
        <h1 className="text-lg font-semibold">Pay Merchant</h1>
        <div className="w-10" />
      </div>

      {step === "input" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-card p-4 text-center">
            <p className="text-xs text-secondary mb-1 uppercase tracking-wider">Mainnet</p>
            <p className="text-tertiary text-xs">Base · Private Payment via WalletConnect</p>
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

      {/* Identity Collection Form */}
      {step === "collect_data" && (
        <div className="space-y-4">
          {paymentInfo && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-elevated">
              <div className="flex-1">
                <p className="font-medium text-primary">{paymentInfo.merchant?.name ?? "Merchant"}</p>
                <p className="text-xs text-tertiary">
                  ${formatTokenAmount(paymentInfo.amount?.value ?? "0", paymentInfo.amount?.display?.decimals ?? 2)}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <p className="font-medium text-primary">Identity Verification</p>
            <p className="text-xs text-tertiary">Required for compliance before payment.</p>
          </div>

          {collectFields.map((field) => (
            <div key={field.id}>
              <label className="block text-xs text-secondary mb-1.5">
                {field.name}{field.required && <span className="text-red ml-0.5">*</span>}
              </label>
              {field.fieldType === "date" ? (
                <input
                  type="date"
                  value={collectValues[field.id] ?? ""}
                  onChange={(e) => setCollectValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  className="w-full h-12 rounded-2xl bg-elevated border border-line px-4 text-primary focus:outline-none focus:border-accent"
                />
              ) : (
                <input
                  type="text"
                  value={collectValues[field.id] ?? ""}
                  onChange={(e) => setCollectValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  placeholder={field.name}
                  className="w-full h-12 rounded-2xl bg-elevated border border-line px-4 text-primary placeholder:text-tertiary focus:outline-none focus:border-accent"
                />
              )}
            </div>
          ))}

          {error && (
            <p className="text-red text-sm">{error}</p>
          )}

          <p className="text-xs text-tertiary">By continuing, you accept the Terms of Service.</p>

          <button
            onClick={handleSubmitCollectData}
            className="w-full h-14 rounded-2xl bg-accent text-white text-base font-semibold hover:bg-accent-hover transition-colors"
          >
            Continue
          </button>
          <button onClick={reset} className="w-full text-sm text-secondary">Cancel</button>
        </div>
      )}

      {step === "fund_burner" && paymentInfo && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-secondary">Payment to</p>
          <p className="text-xl font-bold">{paymentInfo.merchant?.name ?? "Merchant"}</p>
          <p className="text-3xl font-bold">
            ${formatTokenAmount(paymentInfo.amount?.value ?? "0", paymentInfo.amount?.display?.decimals ?? 2)}
          </p>
          <div className="rounded-2xl bg-card p-4 text-left space-y-2">
            <p className="text-xs text-secondary font-medium">How it works:</p>
            <p className="text-xs text-tertiary">1. Your payment is routed privately</p>
            <p className="text-xs text-tertiary">2. Transaction is signed securely</p>
            <p className="text-xs text-tertiary">3. WalletConnect settles with the merchant</p>
            <p className="text-xs text-tertiary">4. No on-chain link between you and the merchant</p>
          </div>
          <button
            onClick={handleFundBurner}
            className="w-full h-14 rounded-2xl bg-accent text-white text-base font-semibold hover:bg-accent-hover transition-colors"
          >
            Approve & Pay
          </button>
          <button onClick={reset} className="text-sm text-secondary">Cancel</button>
        </div>
      )}

      {step === "funding" && (
        <div className="flex flex-col items-center justify-center py-12 space-y-5">
          <Spinner size={32} />
          <p className="text-primary text-sm font-medium">Sending transaction privately...</p>
          <div className="w-full max-w-xs space-y-3">
            <StepRow label="Preparing private payment (passkey)" active done={false} />
            <StepRow label="Waiting for confirmation" active={false} done={false} />
          </div>
        </div>
      )}

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
                {formatTokenAmount(opt.amount?.value ?? "0", opt.amount?.display?.decimals ?? 2)}
              </p>
            </button>
          ))}
          <button onClick={reset} className="w-full text-sm text-secondary">Cancel</button>
        </div>
      )}

      {step === "signing" && (
        <div className="flex flex-col items-center justify-center py-12 space-y-5">
          <Spinner size={32} />
          <p className="text-primary text-sm font-medium">Signing payment privately...</p>
          <div className="w-full max-w-xs space-y-3">
            <StepRow label="Preparing payment" done active={false} />
            <StepRow label="Signing transaction" active done={false} />
            <StepRow label="Confirming with merchant" active={false} done={false} />
          </div>
        </div>
      )}

      {step === "confirming" && (
        <div className="flex flex-col items-center justify-center py-12 space-y-5">
          <Spinner size={32} />
          <p className="text-primary text-sm font-medium">Confirming with merchant...</p>
          <div className="w-full max-w-xs space-y-3">
            <StepRow label="Preparing payment" done active={false} />
            <StepRow label="Signing transaction" done active={false} />
            <StepRow label="Confirming with merchant" active done={false} />
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green/10 text-green flex items-center justify-center text-3xl">✓</div>
          <p className="text-xl font-bold">Paid!</p>
          <p className="text-secondary text-sm">Payment settled privately</p>
          {txResult && <p className="text-xs text-tertiary font-mono break-all">ID: {txResult}</p>}
          <button onClick={() => router.push("/dashboard")} className="mt-4 h-12 px-8 rounded-2xl bg-elevated text-primary font-medium text-sm">
            Done
          </button>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-red/10 text-red flex items-center justify-center text-3xl">✕</div>
          <p className="text-xl font-bold">Failed</p>
          <p className="text-red text-sm">{error}</p>
          <button onClick={reset} className="mt-4 h-12 px-8 rounded-2xl bg-elevated text-primary font-medium text-sm">
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
