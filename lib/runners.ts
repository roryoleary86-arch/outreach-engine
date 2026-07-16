import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import {
  extractJson,
  validateResearch,
  type ResearchResult,
} from "./research";

const MODEL = "claude-fable-5";
const MAX_CONTINUATIONS = 6;

/** The model declined the request via its safety classifier. */
export class RefusalError extends Error {
  constructor(message = "The model declined this request (safety classifier).") {
    super(message);
    this.name = "RefusalError";
  }
}

export function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.",
    );
  }
  // Catch the classic mistake of pasting a *masked* key display
  // (sk-ant-a•••••…) instead of the real key — bullets and any other
  // non-ASCII character can't be sent in an HTTP header.
  if (/[^\x21-\x7e]/.test(key)) {
    throw new Error(
      "ANTHROPIC_API_KEY contains invalid characters (it looks like the masked '•••' display was pasted instead of the real key). Copy the actual key — it should be ~108 plain characters ending in 'AA' with no dots — and re-save it in Vercel, then redeploy.",
    );
  }
  return new Anthropic({ apiKey: key });
}

const WEB_TOOLS = [
  { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 10 },
  { type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: 10 },
];

// Fable 5's safety classifiers can decline benign requests; retry server-side
// on Opus 4.8 instead of failing.
const FALLBACK = {
  betas: ["server-side-fallback-2026-06-01"] as string[],
  fallbacks: [{ model: "claude-opus-4-8" }],
};

/**
 * Run a web-tool conversation to completion, handling the server-side
 * pause_turn loop. Returns the concatenated final text, or throws
 * RefusalError.
 */
async function runToText(
  client: Anthropic,
  opts: {
    system: string;
    userPrompt: string;
    tools?: typeof WEB_TOOLS;
    maxTokens?: number;
  },
): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: opts.userPrompt },
  ];

  let response: Anthropic.Beta.BetaMessage | null = null;
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 64000,
      system: opts.system,
      messages,
      ...(opts.tools ? { tools: opts.tools } : {}),
      betas: FALLBACK.betas,
      fallbacks: FALLBACK.fallbacks,
    });
    response = await stream.finalMessage();

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    break;
  }

  if (!response) throw new Error("No response from model.");
  if (response.stop_reason === "refusal") throw new RefusalError();
  if (response.stop_reason === "pause_turn") {
    throw new Error("Did not finish within the tool-use limit. Try again.");
  }

  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

const RESEARCH_SYSTEM = `You are a B2B outreach researcher. You research one firm at a time using web search and web fetch, then report findings as JSON.

Rules — these are hard requirements:
1. VERIFY EVERYTHING. Every fact you report must come from a page you actually fetched or a search result you actually saw, and must carry the exact URL of that source. If you cannot attach a real URL to a fact, do not report the fact.
2. Find the firm's team/people/about page and identify the person best matching the requested target role. If nobody matches exactly, pick the closest senior decision-maker and say so in notes.
3. Report 2-3 specific, verifiable facts about that person or the firm: career history, recent news or deals, awards, specialisms, publications. Prefer facts about the person; fall back to the firm. Specific beats generic — "advised on the £40m sale of X in 2025" beats "has M&A experience".
4. EMAIL: report an address ONLY if it is literally published on a page you fetched. NEVER guess, infer, or construct an email from a pattern (no firstname.lastname@ guesses). Classify it:
   - "direct": a personal address for the named contact, published on the site
   - "general": only a shared inbox exists (info@, hello@, enquiries@), including when the site uses Cloudflare email obfuscation that hides the real address
   - "none": no address published at all
   Include the URL of the page where the email appears as email_source_url. If only a shared inbox exists, put it in general_inbox.
5. PHONE: if a phone number for the firm or contact is published on a page you fetched, capture it in phone with its source URL in phone_source_url. Never guess a phone number.
6. Respond with ONLY a JSON object, no prose before or after, matching exactly:
{
  "firm_name": string,
  "contact_name": string | null,
  "contact_role": string | null,
  "contact_email": string | null,
  "email_type": "direct" | "general" | "none",
  "email_source_url": string | null,
  "general_inbox": string | null,
  "phone": string | null,
  "phone_source_url": string | null,
  "facts": [{ "fact": string, "source_url": string }],
  "notes": string | null
}
Use notes for caveats: ambiguity about the contact, staleness of a source, or why no email was found.`;

export async function runResearch(
  client: Anthropic,
  args: { firmName?: string | null; websiteUrl: string; targetRole: string },
): Promise<ResearchResult> {
  const firm =
    args.firmName && args.firmName.trim()
      ? args.firmName.trim()
      : "(unknown — derive from the website)";

  const userPrompt = `Research this firm and find the best outreach contact.

Firm name: ${firm}
Website: ${args.websiteUrl.trim()}
Target role: ${args.targetRole}

Start by fetching the website, find the team/people page, then verify facts. Respond with the JSON object only.`;

  const text = await runToText(client, {
    system: RESEARCH_SYSTEM,
    userPrompt,
    tools: WEB_TOOLS,
  });
  return validateResearch(extractJson(text));
}

// ---------------------------------------------------------------------------
// URL resolution
// ---------------------------------------------------------------------------

export interface UrlResolution {
  found: boolean;
  url: string | null;
  confidence: "high" | "low";
  reasoning: string;
}

const RESOLVE_SYSTEM = `You find the official website of a firm using web search and web fetch, and verify it belongs to that specific firm.

Rules:
1. Search for the firm by name and location.
2. FETCH the most likely candidate and confirm it is the firm's OWN official website — the firm name (and location, if given) must match what the site says about itself.
3. REJECT directory listings, review aggregators, legal-register pages, social profiles, and sites belonging to a different firm with a similar name. These are NOT valid.
4. Only report confidence "high" when you have fetched the site and confirmed it is this exact firm's own domain. If you are not sure, report confidence "low".
5. Respond with ONLY this JSON object, nothing else:
{ "found": boolean, "url": string | null, "confidence": "high" | "low", "reasoning": string }`;

export async function resolveWebsite(
  client: Anthropic,
  args: { firmName: string; location?: string | null },
): Promise<UrlResolution> {
  const userPrompt = `Find and verify the official website for this firm.

Firm name: ${args.firmName}
Location: ${args.location?.trim() || "(not provided)"}

Respond with the JSON object only.`;

  const text = await runToText(client, {
    system: RESOLVE_SYSTEM,
    userPrompt,
    tools: WEB_TOOLS,
    maxTokens: 32000,
  });

  const raw = extractJson<Partial<UrlResolution>>(text);
  const url =
    typeof raw.url === "string" && /^https?:\/\//.test(raw.url) ? raw.url : null;
  const confidence = raw.confidence === "high" ? "high" : "low";
  // Only treat as found when we have a URL AND high confidence.
  const found = Boolean(url) && confidence === "high" && raw.found !== false;
  return {
    found,
    url,
    confidence,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
  };
}

// ---------------------------------------------------------------------------
// Register parsing
// ---------------------------------------------------------------------------

export interface ParseRecord {
  firm_name: string;
  location: string | null;
  partner_names: string[];
  website_url: string | null;
}

const PARSE_SYSTEM = `You convert an unstructured firm register (CSV or text copied from a PDF) into structured records.

Rules:
1. Extract one record per distinct firm. Do NOT invent firms that aren't present.
2. For each firm capture: firm_name (required), location/address if present, any partner or principal names listed, and a website URL if one is explicitly present in the input.
3. Do not guess or fabricate websites, locations, or partner names — use null / empty arrays when the input doesn't contain them.
4. Respond with ONLY this JSON object, nothing else:
{ "firms": [ { "firm_name": string, "location": string | null, "partner_names": string[], "website_url": string | null } ] }`;

export async function parseRegister(
  client: Anthropic,
  rawInput: string,
): Promise<ParseRecord[]> {
  const userPrompt = `Parse the following firm register into structured records. Respond with the JSON object only.

--- BEGIN INPUT ---
${rawInput}
--- END INPUT ---`;

  const text = await runToText(client, {
    system: PARSE_SYSTEM,
    userPrompt,
    // No web tools — pure structuring.
    maxTokens: 64000,
  });

  const raw = extractJson<{ firms?: unknown[] }>(text);
  const list = Array.isArray(raw.firms) ? raw.firms : [];
  const records: ParseRecord[] = [];
  for (const item of list) {
    const f = item as Partial<ParseRecord>;
    if (!f || typeof f.firm_name !== "string" || !f.firm_name.trim()) continue;
    records.push({
      firm_name: f.firm_name.trim(),
      location:
        typeof f.location === "string" && f.location.trim()
          ? f.location.trim()
          : null,
      partner_names: Array.isArray(f.partner_names)
        ? f.partner_names.filter((n): n is string => typeof n === "string" && !!n.trim())
        : [],
      website_url:
        typeof f.website_url === "string" && /^https?:\/\//.test(f.website_url)
          ? f.website_url
          : null,
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Draft generation
// ---------------------------------------------------------------------------

export function loadVoiceProfile(): string {
  // VOICE_PROFILE env var wins (useful on Vercel); falls back to the
  // voice-profile.md file checked into the repo.
  if (process.env.VOICE_PROFILE?.trim()) return process.env.VOICE_PROFILE;
  try {
    return fs.readFileSync(path.join(process.cwd(), "voice-profile.md"), "utf8");
  } catch {
    return "Write short, plain, direct outreach emails. No corporate filler.";
  }
}

export async function runDraft(
  client: Anthropic,
  research: ResearchResult,
): Promise<string> {
  const factsList = research.facts
    .map((f, i) => `${i + 1}. ${f.fact} (source: ${f.source_url})`)
    .join("\n");

  const userPrompt = `Draft a cold outreach email using ONLY the verified research below. Do not invent facts, numbers, or claims that are not in the research. Do not mention that the facts were researched or cite the source URLs in the email itself.

Firm: ${research.firm_name}
Contact: ${research.contact_name ?? "(no named contact — write to the firm)"}${research.contact_role ? `, ${research.contact_role}` : ""}

Verified facts:
${factsList || "(none — keep the email generic but honest)"}

${research.notes ? `Researcher notes: ${research.notes}` : ""}

Output format: first line "Subject: ..." then a blank line, then the email body. Nothing else — no preamble, no commentary.`;

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: loadVoiceProfile(),
    messages: [{ role: "user", content: userPrompt }],
    betas: FALLBACK.betas,
    fallbacks: FALLBACK.fallbacks,
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new RefusalError("The model declined to draft this email.");
  }

  const draft = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!draft) throw new Error("Empty draft returned.");
  return draft;
}
