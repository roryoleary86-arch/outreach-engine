import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { ResearchResult } from "@/lib/research";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-fable-5";

function loadVoiceProfile(): string {
  // VOICE_PROFILE env var wins (useful on Vercel); falls back to the
  // voice-profile.md file checked into the repo.
  if (process.env.VOICE_PROFILE?.trim()) return process.env.VOICE_PROFILE;
  try {
    return fs.readFileSync(path.join(process.cwd(), "voice-profile.md"), "utf8");
  } catch {
    return "Write short, plain, direct outreach emails. No corporate filler.";
  }
}

export async function POST(req: NextRequest) {
  const { research } = (await req.json().catch(() => ({}))) as {
    research?: ResearchResult;
  };

  if (!research || !Array.isArray(research.facts)) {
    return NextResponse.json({ error: "research object is required." }, { status: 400 });
  }

  const client = new Anthropic();

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

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: loadVoiceProfile(),
      messages: [{ role: "user", content: userPrompt }],
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The model declined to draft this email." },
        { status: 502 },
      );
    }

    const draft = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!draft) throw new Error("Empty draft returned.");
    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Draft generation failed.";
    console.error("draft error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
