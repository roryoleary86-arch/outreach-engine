import { NextRequest, NextResponse } from "next/server";
import { getClient, runResearch, RefusalError } from "@/lib/runners";

export const runtime = "nodejs";
export const maxDuration = 300; // research can take minutes on hard sites

export async function POST(req: NextRequest) {
  const { firmName, websiteUrl, targetRole } = await req.json().catch(() => ({}));

  if (!websiteUrl || typeof websiteUrl !== "string") {
    return NextResponse.json({ error: "websiteUrl is required." }, { status: 400 });
  }
  const role =
    typeof targetRole === "string" && targetRole.trim()
      ? targetRole.trim()
      : process.env.DEFAULT_TARGET_ROLE || "Managing Partner";

  try {
    const result = await runResearch(getClient(), {
      firmName: typeof firmName === "string" ? firmName : null,
      websiteUrl,
      targetRole: role,
    });
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof RefusalError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Research failed.";
    console.error("research error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
