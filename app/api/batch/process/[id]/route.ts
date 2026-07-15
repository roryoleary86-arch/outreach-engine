import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  getClient,
  runResearch,
  resolveWebsite,
  RefusalError,
} from "@/lib/runners";
import { statusFromEmailType, type FactsJson } from "@/lib/firm";

export const runtime = "nodejs";
export const maxDuration = 300; // resolution + research can take minutes

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = supabase();

  try {
    const { data: firm, error: fetchErr } = await db
      .from("firms")
      .select("id, firm_name, location, website_url, contact_role")
      .eq("id", id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!firm) return NextResponse.json({ error: "Firm not found." }, { status: 404 });

    const client = getClient();
    const targetRole =
      firm.contact_role || process.env.DEFAULT_TARGET_ROLE || "Managing Partner";

    // 1. Resolve the website if we don't already have one.
    let websiteUrl: string | null = firm.website_url;
    if (!websiteUrl) {
      const resolution = await resolveWebsite(client, {
        firmName: firm.firm_name,
        location: firm.location,
      });
      if (!resolution.found || !resolution.url) {
        await db
          .from("firms")
          .update({
            status: "no_website_found",
            processed_at: new Date().toISOString(),
            error: resolution.reasoning || "No confident website match.",
          })
          .eq("id", id);
        return NextResponse.json({
          id,
          firm_name: firm.firm_name,
          status: "no_website_found",
        });
      }
      websiteUrl = resolution.url;
      await db.from("firms").update({ website_url: websiteUrl }).eq("id", id);
    }

    // 2. Research the firm (reuses the exact single-firm logic).
    const result = await runResearch(client, {
      firmName: firm.firm_name,
      websiteUrl,
      targetRole,
    });

    const status = statusFromEmailType(result.email_type);
    const facts_json: FactsJson = {
      facts: result.facts,
      contact_role: result.contact_role,
      email_type: result.email_type,
      email_source_url: result.email_source_url,
      phone_source_url: result.phone_source_url,
      general_inbox: result.general_inbox,
      notes: result.notes,
    };

    const { error: updErr } = await db
      .from("firms")
      .update({
        contact_name: result.contact_name,
        contact_role: result.contact_role ?? targetRole,
        contact_email: result.contact_email,
        phone: result.phone,
        general_inbox: result.general_inbox,
        facts_json,
        status,
        processed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", id);
    if (updErr) throw new Error(updErr.message);

    return NextResponse.json({
      id,
      firm_name: firm.firm_name,
      status,
      contact_name: result.contact_name,
      contact_email: result.contact_email,
    });
  } catch (err) {
    const message =
      err instanceof RefusalError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Processing failed.";
    console.error("batch process error:", id, err);
    // Record the error but leave the firm pending so it can be retried on a
    // future resume. Best-effort; ignore secondary write failures.
    await db
      .from("firms")
      .update({ error: message, processed_at: new Date().toISOString() })
      .eq("id", id)
      .then(undefined, () => undefined);
    return NextResponse.json(
      { id, firm_name: undefined, status: "pending", error: message },
      { status: 500 },
    );
  }
}
