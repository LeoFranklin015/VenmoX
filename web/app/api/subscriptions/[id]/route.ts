import { NextRequest, NextResponse } from "next/server";
import { getPlan, deletePlan, getSubscribersByPlan } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const plan = await getPlan(id);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const subs = await getSubscribersByPlan(id);

    return NextResponse.json({
      ...plan,
      _id: plan._id.toString(),
      subscribers: subs.map((s) => ({
        _id: s._id.toString(),
        subscriber: s.subscriber,
        status: s.status,
        permissionId: s.permissionId,
        lastChargedAt: s.lastChargedAt,
        created_at: s.created_at,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deletePlan(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
