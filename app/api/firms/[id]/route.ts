import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { FIRM_STATUSES, type FirmStatus } from "@/lib/firm";

export const runtime = "nodejs";

const FIRM_COLUMNS =
  "id, created_at, firm_name, contact_name, contact_email, contact_role, website_url, location, partner_names, phone, general_inbox, facts_json, draft_text, status, batch_id, processed_at, sent_at, error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { data, error } = await supabase()
      .from("firms")
      .select(FIRM_COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ firm: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load firm.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Update editable fields: status (manual), draft_text, contact_email, contact_name.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const update: Record<string, unknown> = {};

  if (typeof body.status === "string") {
    if (!FIRM_STATUSES.includes(body.status as FirmStatus)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    update.status = body.status;
    // Stamp sent_at when the user marks it sent; clear it otherwise.
    update.sent_at = body.status === "sent" ? new Date().toISOString() : null;
  }
  if (typeof body.draft_text === "string") update.draft_text = body.draft_text;
  if (typeof body.contact_email === "string") update.contact_email = body.contact_email;
  if (typeof body.contact_name === "string") update.contact_name = body.contact_name;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const { data, error } = await supabase()
      .from("firms")
      .update(update)
      .eq("id", id)
      .select(FIRM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ firm: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    console.error("firm update error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
