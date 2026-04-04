import { NextRequest, NextResponse } from "next/server";
import { revokeSubscriber } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { subscriberId } = await req.json();
    if (!subscriberId) return NextResponse.json({ error: "subscriberId required" }, { status: 400 });
    await revokeSubscriber(subscriberId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
