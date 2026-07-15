import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { ParsedFirm } from "@/lib/firm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const firms: ParsedFirm[] = Array.isArray(body?.firms) ? body.firms : [];
  const targetRole =
    typeof body?.targetRole === "string" && body.targetRole.trim()
      ? body.targetRole.trim()
      : process.env.DEFAULT_TARGET_ROLE || "Managing Partner";
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null;
  const sourceType = body?.sourceType === "csv" ? "csv" : "text";

  const valid = firms.filter(
    (f) => f && typeof f.firm_name === "string" && f.firm_name.trim(),
  );
  if (valid.length === 0) {
    return NextResponse.json({ error: "No firms to add." }, { status: 400 });
  }

  const db = supabase();
  try {
    const { data: batch, error: batchErr } = await db
      .from("batches")
      .insert({ name, target_role: targetRole, source_type: sourceType, total: valid.length })
      .select("id")
      .single();
    if (batchErr) throw new Error(batchErr.message);

    const rows = valid.map((f) => ({
      firm_name: f.firm_name.trim(),
      location: f.location ?? null,
      partner_names: f.partner_names ?? [],
      website_url: f.website_url ?? null,
      contact_role: targetRole,
      batch_id: batch.id,
      status: "pending" as const,
    }));

    const { data: inserted, error: insErr } = await db
      .from("firms")
      .insert(rows)
      .select("id, firm_name, status");
    if (insErr) throw new Error(insErr.message);

    return NextResponse.json({ batchId: batch.id, firms: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Batch creation failed.";
    console.error("batch create error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
