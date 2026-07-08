"use client";

import { useState } from "react";
import type { ResearchResult } from "@/lib/research";

type SaveStatus = "researched" | "sent" | "no_email_found";

export default function Home() {
  const [firmName, setFirmName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [targetRole, setTargetRole] = useState("Managing Partner");

  const [researching, setResearching] = useState(false);
  const [research, setResearch] = useState<ResearchResult | null>(null);

  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState("");

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("researched");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function runResearch(e: React.FormEvent) {
    e.preventDefault();
    setResearching(true);
    setError(null);
    setResearch(null);
    setDraft("");
    setSavedId(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firmName, websiteUrl, targetRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed.");
      const result: ResearchResult = data.result;
      setResearch(result);
      setSaveStatus(result.email_type === "direct" ? "researched" : "no_email_found");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed.");
    } finally {
      setResearching(false);
    }
  }

  async function generateDraft() {
    if (!research) return;
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ research }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft generation failed.");
      setDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft generation failed.");
    } finally {
      setDrafting(false);
    }
  }

  async function copy(text: string, which: string) {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  async function save() {
    if (!research) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/firms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firm_name: research.firm_name,
          contact_name: research.contact_name,
          contact_email: research.contact_email,
          facts_json: {
            facts: research.facts,
            contact_role: research.contact_role,
            email_type: research.email_type,
            email_source_url: research.email_source_url,
            notes: research.notes,
          },
          draft_text: draft || null,
          status: saveStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setSavedId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const emailBadge =
    research?.email_type === "direct" ? (
      <span className="badge direct">direct email</span>
    ) : research?.email_type === "general" ? (
      <span className="badge general">general inbox only</span>
    ) : research ? (
      <span className="badge none">no email found</span>
    ) : null;

  return (
    <main>
      <h1>Outreach Engine</h1>
      <p className="subtitle">
        Paste a firm, get verified facts with sources, draft the email.
      </p>

      {/* 1. Input */}
      <form className="panel" onSubmit={runResearch}>
        <label htmlFor="firm">Firm name (optional)</label>
        <input
          id="firm"
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          placeholder="Smith & Co LLP"
        />
        <label htmlFor="url">Website URL</label>
        <input
          id="url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://smithco.example"
          required
        />
        <label htmlFor="role">Target role</label>
        <input
          id="role"
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          placeholder="Managing Partner"
        />
        <div className="mt row">
          <button type="submit" disabled={researching || !websiteUrl.trim()}>
            {researching && <span className="spinner" />}
            {researching ? "Researching… (can take a few minutes)" : "Research"}
          </button>
        </div>
      </form>

      {/* 2. Results */}
      {research && (
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="contact-line">
                {research.contact_name ?? "No named contact found"}
              </div>
              <div className="muted">
                {[research.contact_role, research.firm_name]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {emailBadge}
          </div>

          <div className="mt row">
            <code>{research.contact_email ?? "—"}</code>
            {research.contact_email && (
              <button
                type="button"
                className="secondary"
                onClick={() => copy(research.contact_email!, "address")}
              >
                {copied === "address" ? "Copied ✓" : "Copy address"}
              </button>
            )}
            {research.email_source_url && (
              <a
                className="muted"
                href={research.email_source_url}
                target="_blank"
                rel="noreferrer"
              >
                email source ↗
              </a>
            )}
          </div>
          {research.email_type === "general" && (
            <p className="muted mt">
              ⚠ Only a general inbox is published — no direct address for this
              contact. Nothing has been guessed.
            </p>
          )}
          {research.email_type === "none" && (
            <p className="muted mt">
              ⚠ No email address is published on the site. Nothing has been
              guessed.
            </p>
          )}

          <div className="mt">
            {research.facts.length === 0 && (
              <p className="muted">No verifiable facts with sources were found.</p>
            )}
            {research.facts.map((f, i) => (
              <div className="fact" key={i}>
                <div>{f.fact}</div>
                <a href={f.source_url} target="_blank" rel="noreferrer">
                  {f.source_url}
                </a>
              </div>
            ))}
          </div>

          {research.notes && <p className="muted mt">Notes: {research.notes}</p>}

          <div className="mt">
            <button type="button" onClick={generateDraft} disabled={drafting}>
              {drafting && <span className="spinner" />}
              {drafting ? "Drafting…" : draft ? "Regenerate draft" : "Generate draft"}
            </button>
          </div>
        </section>
      )}

      {/* 3. Draft */}
      {draft && research && (
        <section className="panel">
          <label htmlFor="draft">Draft (edit before copying)</label>
          <textarea
            id="draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt row">
            <button
              type="button"
              className="secondary"
              onClick={() => copy(draft, "email")}
            >
              {copied === "email" ? "Copied ✓" : "Copy email"}
            </button>
            {research.contact_email && (
              <button
                type="button"
                className="secondary"
                onClick={() => copy(research.contact_email!, "address2")}
              >
                {copied === "address2" ? "Copied ✓" : "Copy address"}
              </button>
            )}
          </div>
        </section>
      )}

      {/* 4. Save */}
      {research && (
        <section className="panel">
          <div className="row">
            <select
              value={saveStatus}
              onChange={(e) => setSaveStatus(e.target.value as SaveStatus)}
              style={{ width: "auto" }}
            >
              <option value="researched">researched</option>
              <option value="sent">sent</option>
              <option value="no_email_found">no_email_found</option>
            </select>
            <button type="button" onClick={save} disabled={saving}>
              {saving && <span className="spinner" />}
              {saving ? "Saving…" : "Save to Supabase"}
            </button>
            {savedId && <span className="success">Saved ✓</span>}
          </div>
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </main>
  );
}
