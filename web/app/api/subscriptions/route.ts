import { NextRequest, NextResponse } from "next/server";
import { createPlan, listPlans } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { name, description, amount, period, spender } = await req.json();
    if (!name || !amount || !period || !spender) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await createPlan({ name, description: description || "", amount, period, spender });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const plans = await listPlans();
    return NextResponse.json({ plans });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
