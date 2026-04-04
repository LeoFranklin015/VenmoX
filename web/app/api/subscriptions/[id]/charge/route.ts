import { NextRequest, NextResponse } from "next/server";
import { getSubscriber, getPlan, updateLastCharged } from "@/lib/db";
import { Account } from "@jaw.id/core";
import { privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Charge a specific subscriber: POST /api/subscriptions/[id]/charge
// `id` here is the SUBSCRIBER id, not the plan id
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sub = await getSubscriber(id);
    if (!sub) return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    if (sub.status !== "active") return NextResponse.json({ error: "Subscription is not active" }, { status: 400 });
    if (!sub.permissionId) return NextResponse.json({ error: "No permission ID" }, { status: 400 });

    const plan = await getPlan(sub.plan_id);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const spenderKey = process.env.SPENDER_PRIVATE_KEY as `0x${string}`;
    if (!spenderKey) return NextResponse.json({ error: "SPENDER_PRIVATE_KEY not configured" }, { status: 500 });

    const jawApiKey = process.env.NEXT_PUBLIC_JAW_API_KEY || process.env.JAW_API_KEY;
    if (!jawApiKey) return NextResponse.json({ error: "JAW_API_KEY not configured" }, { status: 500 });

    const spenderAccount = privateKeyToAccount(spenderKey);
    const account = await Account.fromLocalAccount(
      { chainId: 8453, apiKey: jawApiKey },
      spenderAccount
    );

    const { id: callId } = await account.sendCalls(
      [{
        to: USDC as `0x${string}`,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [plan.spender as `0x${string}`, parseUnits(plan.amount, 6)],
        }),
      }],
      { permissionId: sub.permissionId as `0x${string}` }
    );

    await updateLastCharged(id);

    return NextResponse.json({ success: true, callId });
  } catch (e) {
    console.error("[charge] Error:", e);
    const raw = e instanceof Error ? e.message : "Charge failed";

    // Parse common revert reasons into user-friendly messages
    let message = "Charge failed";
    if (raw.includes("execution reverted")) {
      message = "Cannot charge right now — the permission may not be active on-chain yet, the subscriber may have insufficient USDC, or the spend limit for this period has been reached. Try again later.";
    } else if (raw.includes("invalid permission")) {
      message = "Permission is invalid or has been revoked.";
    } else {
      message = raw.length > 200 ? raw.slice(0, 200) + "..." : raw;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
