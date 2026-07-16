import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let clientUrl: string | null = null;

export function supabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set (Vercel → Settings → Environment Variables), then redeploy.",
    );
  }
  try {
    new URL(url);
  } catch {
    throw new Error(
      `SUPABASE_URL is not a valid URL: ${JSON.stringify(url.slice(0, 40))} — it should look like https://<project-ref>.supabase.co`,
    );
  }
  if (!client || clientUrl !== url) {
    client = createClient(url, key, { auth: { persistSession: false } });
    clientUrl = url;
  }
  return client;
}

/** Host portion of the configured Supabase URL, for error messages. */
export function supabaseHost(): string {
  try {
    return new URL(process.env.SUPABASE_URL?.trim() ?? "").host;
  } catch {
    return "(invalid SUPABASE_URL)";
  }
}
