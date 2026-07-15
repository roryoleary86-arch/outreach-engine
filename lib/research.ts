export type EmailType = "direct" | "general" | "none";

export interface Fact {
  fact: string;
  source_url: string;
}

export interface ResearchResult {
  firm_name: string;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  /** "direct" = published personal address; "general" = only a shared inbox (info@ etc.); "none" = nothing published */
  email_type: EmailType;
  email_source_url: string | null;
  /** A published phone number for the firm or contact — captured for phone-first outreach. */
  phone: string | null;
  phone_source_url: string | null;
  /** A shared inbox (info@, hello@) when no direct address exists. */
  general_inbox: string | null;
  facts: Fact[];
  notes: string | null;
}

/**
 * Pull the first top-level JSON object out of a text blob. The model is
 * instructed to reply with bare JSON, but this tolerates code fences or
 * stray prose around it.
 */
export function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output.");
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function optUrl(v: unknown): string | null {
  return typeof v === "string" && /^https?:\/\//.test(v) ? v : null;
}

export function validateResearch(raw: unknown): ResearchResult {
  const r = raw as Partial<ResearchResult>;
  if (!r || typeof r !== "object") throw new Error("Model output is not an object.");
  if (typeof r.firm_name !== "string") throw new Error("Missing firm_name.");
  if (!Array.isArray(r.facts)) throw new Error("Missing facts array.");

  const facts: Fact[] = [];
  for (const f of r.facts) {
    // Non-negotiable: a fact without a source URL is dropped, never shown.
    if (
      f &&
      typeof f.fact === "string" &&
      f.fact.trim() &&
      typeof f.source_url === "string" &&
      /^https?:\/\//.test(f.source_url)
    ) {
      facts.push({ fact: f.fact.trim(), source_url: f.source_url });
    }
  }

  const emailType: EmailType =
    r.email_type === "direct" || r.email_type === "general" ? r.email_type : "none";

  return {
    firm_name: r.firm_name,
    contact_name: optString(r.contact_name),
    contact_role: optString(r.contact_role),
    contact_email: emailType !== "none" ? optString(r.contact_email) : null,
    email_type: emailType,
    email_source_url: optUrl(r.email_source_url),
    phone: optString(r.phone),
    phone_source_url: optUrl(r.phone_source_url),
    general_inbox: optString(r.general_inbox),
    facts,
    notes: optString(r.notes),
  };
}
