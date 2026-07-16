import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostic endpoint: reports what this deployment actually sees.
// Protected by the password middleware like every other /api route.
// Never returns secret values — only presence/shape/host info.
export async function GET() {
  const checks: Record<string, string> = {};

  // 1. Anthropic key: present and header-safe?
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    checks.anthropic_key = "MISSING";
  } else if (/[^\x21-\x7e]/.test(key)) {
    checks.anthropic_key =
      "INVALID — contains non-ASCII characters (masked '•' paste?)";
  } else {
    checks.anthropic_key = `ok (starts ${key.slice(0, 12)}…, ${key.length} chars)`;
  }

  // 2. Supabase URL: well-formed?
  const rawUrl = process.env.SUPABASE_URL?.trim() ?? "";
  let host = "";
  try {
    host = new URL(rawUrl).host;
    checks.supabase_url = `ok (${host})`;
  } catch {
    checks.supabase_url = rawUrl
      ? `INVALID — not a valid URL (${JSON.stringify(rawUrl.slice(0, 40))})`
      : "MISSING";
  }

  // 3. Supabase key present?
  const sbKey = process.env.SUPABASE_ANON_KEY?.trim();
  checks.supabase_key = sbKey
    ? `ok (starts ${sbKey.slice(0, 8)}…, ${sbKey.length} chars)`
    : "MISSING";

  // 4. Live Supabase round-trip.
  if (host && sbKey) {
    try {
      const { error } = await supabase().from("firms").select("id").limit(1);
      checks.supabase_connection = error
        ? `FAILED: ${error.message}`
        : "ok — reached database and read firms table";
    } catch (err) {
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? ` (cause: ${err.cause.message})`
          : "";
      checks.supabase_connection = `FAILED: ${
        err instanceof Error ? err.message : String(err)
      }${cause}`;
    }
  } else {
    checks.supabase_connection = "skipped — URL or key missing/invalid";
  }

  checks.app_password = process.env.APP_PASSWORD ? "ok" : "MISSING";
  checks.deployed_at = new Date().toISOString();

  return NextResponse.json(checks);
}
