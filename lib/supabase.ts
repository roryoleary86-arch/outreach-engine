import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set.");
  }
  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
