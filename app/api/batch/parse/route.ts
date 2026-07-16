import { NextRequest, NextResponse } from "next/server";
import { getClient, parseRegister, RefusalError } from "@/lib/runners";
import { supabase, supabaseHost } from "@/lib/supabase";
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

  // Reject binary content (e.g. a PDF/Word file misread as text) before it
  // ever reaches the model. Real text — including accented names — has
  // almost no control characters or Unicode replacement characters; binary
  // misread as text is dominated by them.
  const sample = input.slice(0, 5000);
  let badChars = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    const isControl = code < 32 && code !== 9 && code !== 10 && code !== 13;
    if (isControl || code === 127 || code === 0xfffd) badChars++;
  }
  if (badChars / sample.length > 0.1) {
    return NextResponse.json(
      {
        error:
          "This doesn't look like plain text — it may be a PDF or other binary file read incorrectly. Open the file, copy the text, and paste it in instead.",
      },
      { status: 400 },
    );
  }

  try {
    const records = await parseRegister(getClient(), input);

    // Dedup against every firm already in the database, by normalized name.
    const { data: existing, error } = await supabase()
      .from("firms")
      .select("firm_name");
    if (error) {
      throw new Error(
        `Supabase query failed against ${supabaseHost()}: ${error.message}`,
      );
    }

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
