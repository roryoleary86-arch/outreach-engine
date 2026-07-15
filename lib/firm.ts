import type { EmailType, Fact } from "./research";

export type FirmStatus =
  | "pending"
  | "researched"
  | "drafted"
  | "sent"
  | "no_email_found"
  | "phone_first"
  | "no_website_found";

export const FIRM_STATUSES: FirmStatus[] = [
  "pending",
  "researched",
  "drafted",
  "sent",
  "no_email_found",
  "phone_first",
  "no_website_found",
];

/** Shape stored in firms.facts_json. */
export interface FactsJson {
  facts: Fact[];
  contact_role?: string | null;
  email_type?: EmailType;
  email_source_url?: string | null;
  phone_source_url?: string | null;
  general_inbox?: string | null;
  notes?: string | null;
}

/** A firm row as returned by the API. */
export interface Firm {
  id: string;
  created_at: string;
  firm_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
  website_url: string | null;
  location: string | null;
  partner_names: string[] | null;
  phone: string | null;
  general_inbox: string | null;
  facts_json: FactsJson | null;
  draft_text: string | null;
  status: FirmStatus;
  batch_id: string | null;
  processed_at: string | null;
  sent_at: string | null;
  error: string | null;
}

/** A firm parsed from an uploaded register, before it's committed to a batch. */
export interface ParsedFirm {
  firm_name: string;
  location: string | null;
  partner_names: string[];
  website_url: string | null;
  /** True when a firm with this normalized name already exists in the DB. */
  duplicate: boolean;
}

/**
 * Map the research email classification onto a firm lifecycle status.
 * A direct, published personal address is send-ready ("researched").
 * A general inbox or no address means phone-first outreach.
 */
export function statusFromEmailType(t: EmailType): FirmStatus {
  return t === "direct" ? "researched" : "phone_first";
}

/**
 * Normalize a firm name for dedup: lowercase, drop common legal suffixes and
 * punctuation, collapse whitespace. "Smith & Co. Solicitors LLP" and
 * "smith and co solicitors" collapse to the same key.
 */
export function normalizeFirmName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,'"()]/g, " ")
    .replace(
      /\b(llp|ltd|limited|plc|solicitors|solicitor|law|llc|inc|incorporated|the|and|co|company|partners|partnership)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}
