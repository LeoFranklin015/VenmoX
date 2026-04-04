import { NextRequest, NextResponse } from "next/server";
import { getPaymentOptions } from "@/lib/walletconnect/gateway";

export async function POST(request: NextRequest) {
  const { paymentId, accounts } = await request.json();

  if (!paymentId || !accounts?.length) {
    return NextResponse.json({ error: "Missing paymentId or accounts" }, { status: 400 });
  }

  try {
    console.log("[pay/options] paymentId:", paymentId, "accounts:", accounts.length);
    const data = await getPaymentOptions(paymentId, accounts);
    console.log("[pay/options] Got", data.options?.length ?? 0, "options");
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get options";
    console.error("[pay/options] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
