-- Outreach Engine — batch pipeline migration.
-- Additive: run this once in the Supabase SQL editor AFTER schema.sql.
-- Safe to re-run (idempotent).

-- 1. Batches: one row per uploaded register / batch run.
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  target_role text not null default 'Managing Partner',
  source_type text,           -- 'csv' | 'text'
  total int not null default 0
);

alter table public.batches enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'batches'
      and policyname = 'anon full access to batches'
  ) then
    create policy "anon full access to batches"
      on public.batches for all to anon
      using (true) with check (true);
  end if;
end $$;

-- 2. Extend firms with the columns the batch pipeline needs.
alter table public.firms add column if not exists website_url text;
alter table public.firms add column if not exists location text;
alter table public.firms add column if not exists partner_names jsonb;
alter table public.firms add column if not exists contact_role text;
alter table public.firms add column if not exists phone text;
alter table public.firms add column if not exists general_inbox text;
alter table public.firms add column if not exists batch_id uuid references public.batches(id) on delete set null;
alter table public.firms add column if not exists processed_at timestamptz;
alter table public.firms add column if not exists sent_at timestamptz;
alter table public.firms add column if not exists error text;

-- 3. Widen the status check to cover the batch lifecycle.
--    pending          -> parsed & queued, not yet processed
--    researched       -> has a direct contact email, ready to draft
--    drafted          -> a draft email has been generated
--    sent             -> user marked as sent
--    no_email_found   -> legacy single-firm status (kept for back-compat)
--    phone_first      -> only a general inbox / no email; reach out by phone
--    no_website_found -> URL resolution failed, skipped
alter table public.firms drop constraint if exists firms_status_check;
alter table public.firms
  add constraint firms_status_check check (status in (
    'pending', 'researched', 'drafted', 'sent',
    'no_email_found', 'phone_first', 'no_website_found'
  ));

-- 4. Indexes for the Outreach Hub (filter by status) and batch resume.
create index if not exists firms_status_idx on public.firms (status);
create index if not exists firms_batch_id_idx on public.firms (batch_id);
create index if not exists firms_created_at_idx on public.firms (created_at desc);

-- 5. Normalized-name column for dedup (lowercased, suffixes stripped is done
--    in app code; this just speeds up existence checks by exact name).
create index if not exists firms_firm_name_lower_idx
  on public.firms (lower(firm_name));
