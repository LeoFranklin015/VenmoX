import { NextRequest, NextResponse } from "next/server";
import { addSubscriber } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { planId, subscriber, permissionId } = await req.json();
    if (!planId || !subscriber || !permissionId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    await addSubscriber(planId, subscriber, permissionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
