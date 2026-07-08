# Outreach Engine

Single-page tool for personalized B2B email outreach: paste a firm's website,
get a verified contact + 2-3 cited facts (every fact links to its source URL —
facts without a source are dropped), draft a tone-matched email, copy it, and
log the firm to Supabase.

Built with Next.js (App Router) + the Claude API (`claude-fable-5` with
`web_search` / `web_fetch` server tools, with automatic fallback to Opus 4.8 if
a request is declined) + Supabase. Password-gated single-user tool. Deploys to
Vercel.

## Setup

1. **Supabase** — create a free project, open the SQL editor, run
   [`supabase/schema.sql`](supabase/schema.sql). Grab the project URL and anon
   key from Settings → API.
2. **Env vars** — copy `.env.example` to `.env.local` and fill in:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   - `APP_PASSWORD` (the single login password)
3. **Voice profile** — edit [`voice-profile.md`](voice-profile.md): describe
   your tone and paste 2-4 real emails you've sent. This file is the system
   prompt for draft generation. (On Vercel you can instead set a
   `VOICE_PROFILE` env var, which takes precedence.)

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
```

## Deploy (Vercel)

Import the repo in Vercel, set the four env vars, deploy. The research route
sets `maxDuration = 300` — research on a slow site can take a few minutes, so
enable Fluid Compute (default on new projects) or a plan that allows 300s
functions.

## How research works

One Claude call with the `web_search` and `web_fetch` server tools. The model
is instructed to:

- find the team/people page and pick the contact matching your target role;
- report only facts it can tie to a URL it actually visited — the server also
  drops any fact that comes back without a valid source URL, so nothing
  uncited ever reaches the UI;
- report an email **only if it's literally published** — never guessed from a
  pattern — and classify it `direct` / `general` / `none`.

## Not in scope (yet)

CRM sync, batch/CSV import. Single-firm research and drafting only.
