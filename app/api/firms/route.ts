import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { FIRM_STATUSES } from "@/lib/firm";

export const runtime = "nodejs";

const FIRM_COLUMNS =
  "id, created_at, firm_name, contact_name, contact_email, contact_role, website_url, location, partner_names, phone, general_inbox, facts_json, draft_text, status, batch_id, processed_at, sent_at, error";

// List firms for the Outreach Hub. Optional ?status= filter and ?sort= column.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const sort = url.searchParams.get("sort") || "created_at";
  const dir = url.searchParams.get("dir") === "asc";

  const sortable = new Set([
    "created_at",
    "firm_name",
    "status",
    "sent_at",
    "processed_at",
  ]);
  const sortCol = sortable.has(sort) ? sort : "created_at";

  try {
    let query = supabase().from("firms").select(FIRM_COLUMNS);
    if (status && FIRM_STATUSES.includes(status as never)) {
      query = query.eq("status", status);
    }
    const { data, error } = await query.order(sortCol, { ascending: dir });
    if (error) throw new Error(error.message);
    return NextResponse.json({ firms: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load firms.";
    console.error("firms list error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const STATUSES = ["researched", "sent", "no_email_found"] as const;

// Manual single-firm save (from the single-firm research flow). Unchanged.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.firm_name !== "string" || !body.firm_name.trim()) {
    return NextResponse.json({ error: "firm_name is required." }, { status: 400 });
  }

  const status = STATUSES.includes(body.status) ? body.status : "researched";

  try {
    const { data, error } = await supabase()
      .from("firms")
      .insert({
        firm_name: body.firm_name.trim(),
        contact_name: body.contact_name ?? null,
        contact_email: body.contact_email ?? null,
        website_url: body.website_url ?? null,
        facts_json: body.facts_json ?? null,
        draft_text: body.draft_text ?? null,
        status,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed.";
    console.error("firms error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
