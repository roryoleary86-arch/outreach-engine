import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getClient, runDraft, RefusalError } from "@/lib/runners";
import type { FactsJson } from "@/lib/firm";
import type { ResearchResult, EmailType } from "@/lib/research";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = supabase();

  try {
    const { data: firm, error } = await db
      .from("firms")
      .select("id, firm_name, contact_name, contact_role, contact_email, phone, general_inbox, facts_json, status")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    if (!firm) return NextResponse.json({ error: "Firm not found." }, { status: 404 });

    const fj = (firm.facts_json ?? {}) as FactsJson;

    // Reconstruct the research object the draft runner expects from stored data.
    const research: ResearchResult = {
      firm_name: firm.firm_name,
      contact_name: firm.contact_name,
      contact_role: firm.contact_role ?? fj.contact_role ?? null,
      contact_email: firm.contact_email,
      email_type: (fj.email_type as EmailType) ?? "none",
      email_source_url: fj.email_source_url ?? null,
      phone: firm.phone ?? null,
      phone_source_url: fj.phone_source_url ?? null,
      general_inbox: firm.general_inbox ?? fj.general_inbox ?? null,
      facts: Array.isArray(fj.facts) ? fj.facts : [],
      notes: fj.notes ?? null,
    };

    const draft = await runDraft(getClient(), research);

    const { data: updated, error: updErr } = await db
      .from("firms")
      .update({ draft_text: draft, status: "drafted" })
      .eq("id", id)
      .select("id, firm_name, status, draft_text")
      .single();
    if (updErr) throw new Error(updErr.message);

    return NextResponse.json({ firm: updated });
  } catch (err) {
    if (err instanceof RefusalError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Draft generation failed.";
    console.error("firm draft error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
