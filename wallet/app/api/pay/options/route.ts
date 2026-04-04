import { NextRequest, NextResponse } from "next/server";
import { getPaymentOptions } from "@/lib/walletconnect/gateway";

export async function POST(request: NextRequest) {
  const { paymentId, accounts } = await request.json();

  if (!paymentId || !accounts?.length) {
    return NextResponse.json({ error: "Missing paymentId or accounts" }, { status: 400 });
  }

  try {
    const data = await getPaymentOptions(paymentId, accounts);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get options";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
