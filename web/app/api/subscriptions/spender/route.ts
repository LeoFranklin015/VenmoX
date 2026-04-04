import { NextResponse } from "next/server";
import { Account } from "@jaw.id/core";
import { privateKeyToAccount } from "viem/accounts";

export async function GET() {
  try {
    const spenderKey = process.env.SPENDER_PRIVATE_KEY as `0x${string}`;
    const jawApiKey = process.env.JAW_API_KEY;
    if (!spenderKey || !jawApiKey) {
      return NextResponse.json({ error: "SPENDER_PRIVATE_KEY or JAW_API_KEY not configured" }, { status: 500 });
    }

    const localAccount = privateKeyToAccount(spenderKey);
    const account = await Account.fromLocalAccount(
      { chainId: 8453, apiKey: jawApiKey },
      localAccount
    );

    return NextResponse.json({ address: account.address });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
