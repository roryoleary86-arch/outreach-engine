import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { FirmStatus } from "@/lib/firm";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = supabase();

  try {
    const { data: batch, error: batchErr } = await db
      .from("batches")
      .select("id, name, target_role, source_type, total, created_at")
      .eq("id", id)
      .single();
    if (batchErr) throw new Error(batchErr.message);

    const { data: firms, error: firmsErr } = await db
      .from("firms")
      .select("id, status")
      .eq("batch_id", id);
    if (firmsErr) throw new Error(firmsErr.message);

    const counts: Record<string, number> = {};
    const pendingIds: string[] = [];
    for (const f of firms ?? []) {
      const s = f.status as FirmStatus;
      counts[s] = (counts[s] ?? 0) + 1;
      if (s === "pending") pendingIds.push(f.id);
    }

    return NextResponse.json({
      batch,
      counts,
      pendingIds,
      processed: (firms?.length ?? 0) - pendingIds.length,
      total: firms?.length ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load batch.";
    console.error("batch status error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
