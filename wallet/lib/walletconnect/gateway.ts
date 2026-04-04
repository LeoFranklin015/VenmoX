const WC_PAY_API = "https://api.pay.walletconnect.org/v1/gateway";

function headers() {
  // Gateway API key — falls back to project ID if not set separately
  const apiKey = process.env.WALLETCONNECT_API_KEY || process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
  return {
    "Api-Key": apiKey,
    "Content-Type": "application/json",
  };
}

export interface PaymentOption {
  id: string;
  amount: {
    value: string;
    unit: string;
    display?: {
      amount?: string;
      assetSymbol?: string;
      networkName?: string;
      decimals?: number;
    };
  };
  account: string;
  etaS: number;
  actions: Array<{
    type: "walletRpc" | "build";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collectData?: any;
}

export interface PaymentInfo {
  merchant: { name: string };
  amount: { value: string; unit: string; display?: { decimals?: number } };
  expiresAt: string;
}

export interface PaymentOptionsResponse {
  paymentId: string;
  options: PaymentOption[];
  info: PaymentInfo;
}

async function parseResponse<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label}: ${text || res.statusText}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}: invalid JSON response: ${text.slice(0, 200)}`);
  }
}

export async function getPaymentOptions(
  paymentId: string,
  accounts: string[]
): Promise<PaymentOptionsResponse> {
  const res = await fetch(`${WC_PAY_API}/payment/${paymentId}/options`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ accounts, includePaymentInfo: true }),
  });
  return parseResponse(res, "Failed to get payment options");
}

export interface ConfirmResponse {
  status: "requires_action" | "processing" | "succeeded" | "failed" | "expired";
  isFinal: boolean;
  pollInMs?: number;
}

export async function confirmPayment(
  paymentId: string,
  optionId: string,
  results: Array<{ type: "walletRpc"; data: string[] }>,
  collectedData?: unknown
): Promise<ConfirmResponse> {
  const res = await fetch(`${WC_PAY_API}/payment/${paymentId}/confirm`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ optionId, results, collectedData: collectedData ?? null }),
  });
  return parseResponse(res, "Failed to confirm payment");
}
