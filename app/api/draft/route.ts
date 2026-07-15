import { NextRequest, NextResponse } from "next/server";
import { getClient, runDraft, RefusalError } from "@/lib/runners";
import type { ResearchResult } from "@/lib/research";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { research } = (await req.json().catch(() => ({}))) as {
    research?: ResearchResult;
  };

  if (!research || !Array.isArray(research.facts)) {
    return NextResponse.json({ error: "research object is required." }, { status: 400 });
  }

  try {
    const draft = await runDraft(getClient(), research);
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof RefusalError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Draft generation failed.";
    console.error("draft error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
