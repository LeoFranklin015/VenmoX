import { NextRequest, NextResponse } from "next/server";
import { getPlanById } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const plan = await getPlanById(id);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      _id: plan._id.toString(),
      name: plan.name,
      description: plan.description,
      amount: plan.amount,
      period: plan.period,
      spender: plan.spender,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
