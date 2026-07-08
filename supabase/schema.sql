-- Outreach Engine: run this once in the Supabase SQL editor.

create table if not exists public.firms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  firm_name text not null,
  contact_name text,
  contact_email text,
  facts_json jsonb,
  draft_text text,
  status text not null default 'researched'
    check (status in ('researched', 'sent', 'no_email_found'))
);

-- Personal tool: the app is password-gated and all writes go through the
-- server, so the anon key gets full access to this one table. Tighten this
-- if the project is ever shared.
alter table public.firms enable row level security;

create policy "anon full access to firms"
  on public.firms
  for all
  to anon
  using (true)
  with check (true);
