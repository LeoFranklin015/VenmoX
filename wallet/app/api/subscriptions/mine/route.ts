import { NextRequest, NextResponse } from "next/server";
import { getMySubscriptions } from "@/lib/db";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  try {
    const subs = await getMySubscriptions(address);
    return NextResponse.json({ subscriptions: subs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
