import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const STATUSES = ["researched", "sent", "no_email_found"] as const;

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
