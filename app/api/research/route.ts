import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractJson, validateResearch } from "@/lib/research";

export const runtime = "nodejs";
export const maxDuration = 300; // research can take minutes on hard sites

const MODEL = "claude-fable-5";
const MAX_CONTINUATIONS = 6;

const RESEARCH_SYSTEM = `You are a B2B outreach researcher. You research one firm at a time using web search and web fetch, then report findings as JSON.

Rules — these are hard requirements:
1. VERIFY EVERYTHING. Every fact you report must come from a page you actually fetched or a search result you actually saw, and must carry the exact URL of that source. If you cannot attach a real URL to a fact, do not report the fact.
2. Find the firm's team/people/about page and identify the person best matching the requested target role. If nobody matches exactly, pick the closest senior decision-maker and say so in notes.
3. Report 2-3 specific, verifiable facts about that person or the firm: career history, recent news or deals, awards, specialisms, publications. Prefer facts about the person; fall back to the firm. Specific beats generic — "advised on the £40m sale of X in 2025" beats "has M&A experience".
4. EMAIL: report an address ONLY if it is literally published on a page you fetched. NEVER guess, infer, or construct an email from a pattern (no firstname.lastname@ guesses). Classify it:
   - "direct": a personal address for the named contact, published on the site
   - "general": only a shared inbox exists (info@, hello@, enquiries@)
   - "none": no address published at all
   Include the URL of the page where the email appears as email_source_url.
5. Respond with ONLY a JSON object, no prose before or after, matching exactly:
{
  "firm_name": string,
  "contact_name": string | null,
  "contact_role": string | null,
  "contact_email": string | null,
  "email_type": "direct" | "general" | "none",
  "email_source_url": string | null,
  "facts": [{ "fact": string, "source_url": string }],
  "notes": string | null
}
Use notes for caveats: ambiguity about the contact, staleness of a source, or why no email was found.`;

export async function POST(req: NextRequest) {
  const { firmName, websiteUrl, targetRole } = await req.json().catch(() => ({}));

  if (!websiteUrl || typeof websiteUrl !== "string") {
    return NextResponse.json({ error: "websiteUrl is required." }, { status: 400 });
  }
  const role =
    typeof targetRole === "string" && targetRole.trim()
      ? targetRole.trim()
      : process.env.DEFAULT_TARGET_ROLE || "Managing Partner";

  const client = new Anthropic();

  const userPrompt = `Research this firm and find the best outreach contact.

Firm name: ${typeof firmName === "string" && firmName.trim() ? firmName.trim() : "(unknown — derive from the website)"}
Website: ${websiteUrl.trim()}
Target role: ${role}

Start by fetching the website, find the team/people page, then verify facts. Respond with the JSON object only.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  try {
    let response: Anthropic.Beta.BetaMessage | null = null;

    // Server tools run in an API-side loop; it can stop with pause_turn —
    // append the assistant turn and re-send to resume.
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        system: RESEARCH_SYSTEM,
        messages,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 10 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10 },
        ],
        // Fable 5's safety classifiers can decline benign requests; retry
        // server-side on Opus 4.8 instead of failing the search.
        betas: ["server-side-fallback-2026-06-01"],
        fallbacks: [{ model: "claude-opus-4-8" }],
      });
      response = await stream.finalMessage();

      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      break;
    }

    if (!response) throw new Error("No response from model.");

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The model declined this request (safety classifier). Try rephrasing or a different firm." },
        { status: 502 },
      );
    }
    if (response.stop_reason === "pause_turn") {
      return NextResponse.json(
        { error: "Research did not finish within the tool-use limit. Try again." },
        { status: 504 },
      );
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const result = validateResearch(extractJson(text));
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research failed.";
    console.error("research error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
