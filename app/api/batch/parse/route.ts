import { NextRequest, NextResponse } from "next/server";
import { getClient, parseRegister, RefusalError } from "@/lib/runners";
import { supabase } from "@/lib/supabase";
import { normalizeFirmName, type ParsedFirm } from "@/lib/firm";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input) {
    return NextResponse.json({ error: "input is required." }, { status: 400 });
  }
  if (input.length > 200_000) {
    return NextResponse.json(
      { error: "Input is too large — split the register into smaller chunks." },
      { status: 413 },
    );
  }

  try {
    const records = await parseRegister(getClient(), input);

    // Dedup against every firm already in the database, by normalized name.
    const { data: existing, error } = await supabase()
      .from("firms")
      .select("firm_name");
    if (error) throw new Error(error.message);

    const seen = new Set(
      (existing ?? []).map((r: { firm_name: string }) => normalizeFirmName(r.firm_name)),
    );

    const firms: ParsedFirm[] = records.map((r) => {
      const key = normalizeFirmName(r.firm_name);
      const duplicate = seen.has(key);
      // Also dedup within the parsed batch itself.
      seen.add(key);
      return {
        firm_name: r.firm_name,
        location: r.location,
        partner_names: r.partner_names,
        website_url: r.website_url,
        duplicate,
      };
    });

    return NextResponse.json({ firms });
  } catch (err) {
    if (err instanceof RefusalError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Parse failed.";
    console.error("parse error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
