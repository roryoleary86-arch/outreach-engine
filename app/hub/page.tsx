"use client";

import { useCallback, useEffect, useState } from "react";
import type { Firm, FirmStatus } from "@/lib/firm";
import { FIRM_STATUSES } from "@/lib/firm";
import { STATUS_LABEL, statusClass, pool } from "@/lib/ui";

export default function HubPage() {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState("created_at");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Firm | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("sort", sort);
      const res = await fetch(`/api/firms?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load firms.");
      setFirms(data.firms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load firms.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sort]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const researchedSelected = firms.filter(
    (f) => selected.has(f.id) && f.status === "researched",
  );

  async function bulkDraft() {
    if (researchedSelected.length === 0) return;
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: researchedSelected.length });
    await pool(researchedSelected, 4, async (f) => {
      await fetch(`/api/firms/${f.id}/draft`, { method: "POST" }).catch(() => {});
      setBulkProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    });
    setBulkBusy(false);
    setBulkProgress(null);
    setSelected(new Set());
    load();
  }

  const counts: Record<string, number> = {};
  for (const f of firms) counts[f.status] = (counts[f.status] ?? 0) + 1;

  return (
    <main className="wide">
      <h1>Outreach Hub</h1>
      <p className="subtitle">Every firm you&apos;ve processed, with status and drafts.</p>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
          <div className="row">
            <label htmlFor="filter" style={{ margin: 0 }}>Status</label>
            <select
              id="filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: "auto" }}
            >
              <option value="all">all ({firms.length})</option>
              {FIRM_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>

            <label htmlFor="sort" style={{ margin: 0 }}>Sort</label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: "auto" }}>
              <option value="created_at">date added</option>
              <option value="firm_name">firm name</option>
              <option value="status">status</option>
              <option value="sent_at">date sent</option>
            </select>
          </div>

          <div className="row">
            <button
              type="button"
              onClick={bulkDraft}
              disabled={bulkBusy || researchedSelected.length === 0}
            >
              {bulkBusy && <span className="spinner" />}
              {bulkProgress
                ? `Drafting ${bulkProgress.done}/${bulkProgress.total}…`
                : `Draft selected (${researchedSelected.length})`}
            </button>
            <button type="button" className="secondary" onClick={load}>Refresh</button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : firms.length === 0 ? (
        <p className="muted">No firms yet. Run a batch or a single-firm search.</p>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Firm</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Added</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {firms.map((f) => (
                <tr key={f.id} onClick={() => setDetail(f)} className="clickable">
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => toggleSelect(f.id)}
                      disabled={f.status !== "researched"}
                      title={f.status !== "researched" ? "Only send-ready firms can be bulk-drafted" : ""}
                    />
                  </td>
                  <td>{f.firm_name}</td>
                  <td className="muted">{f.contact_name ?? "—"}</td>
                  <td><span className={`badge ${statusClass(f.status)}`}>{STATUS_LABEL[f.status]}</span></td>
                  <td className="muted">{new Date(f.created_at).toLocaleDateString()}</td>
                  <td className="muted">{f.sent_at ? new Date(f.sent_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {detail && (
        <FirmDetail
          firm={detail}
          onClose={() => setDetail(null)}
          onChanged={(updated) => {
            setDetail(updated);
            setFirms((list) => list.map((f) => (f.id === updated.id ? updated : f)));
          }}
        />
      )}
    </main>
  );
}

function FirmDetail({
  firm,
  onClose,
  onChanged,
}: {
  firm: Firm;
  onClose: () => void;
  onChanged: (f: Firm) => void;
}) {
  const [draft, setDraft] = useState(firm.draft_text ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const facts = firm.facts_json?.facts ?? [];

  useEffect(() => {
    setDraft(firm.draft_text ?? "");
  }, [firm]);

  async function patch(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    setErr(null);
    try {
      const res = await fetch(`/api/firms/${firm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed.");
      onChanged(data.firm);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function generateDraft() {
    setBusy("draft");
    setErr(null);
    try {
      const res = await fetch(`/api/firms/${firm.id}/draft`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed.");
      // Re-fetch full firm so facts etc. stay populated.
      const full = await fetch(`/api/firms/${firm.id}`).then((r) => r.json());
      onChanged(full.firm);
      setDraft(full.firm.draft_text ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Draft failed.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, which: string) {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{firm.firm_name}</h2>
          <button type="button" className="secondary" onClick={onClose}>Close</button>
        </div>

        <div className="mt">
          <span className={`badge ${statusClass(firm.status)}`}>{STATUS_LABEL[firm.status]}</span>
          {firm.contact_name && <span className="muted" style={{ marginLeft: 10 }}>{firm.contact_name}{firm.contact_role ? `, ${firm.contact_role}` : ""}</span>}
        </div>

        <div className="mt row" style={{ gap: 16, flexWrap: "wrap" }}>
          {firm.contact_email && (
            <span className="row">
              <code>{firm.contact_email}</code>
              <button type="button" className="secondary" onClick={() => copy(firm.contact_email!, "email")}>
                {copied === "email" ? "Copied ✓" : "Copy address"}
              </button>
            </span>
          )}
          {firm.phone && <span className="muted">☎ {firm.phone}</span>}
          {firm.general_inbox && !firm.contact_email && <span className="muted">inbox: {firm.general_inbox}</span>}
          {firm.website_url && <a className="muted" href={firm.website_url} target="_blank" rel="noreferrer">website ↗</a>}
        </div>

        {firm.status === "no_website_found" && firm.error && (
          <p className="muted mt">No website found: {firm.error}</p>
        )}

        <h3 className="mt">Verified facts</h3>
        {facts.length === 0 ? (
          <p className="muted">No verified facts on file.</p>
        ) : (
          facts.map((f, i) => (
            <div className="fact" key={i}>
              <div>{f.fact}</div>
              <a href={f.source_url} target="_blank" rel="noreferrer">{f.source_url}</a>
            </div>
          ))
        )}
        {firm.facts_json?.notes && <p className="muted mt">Notes: {firm.facts_json.notes}</p>}

        <h3 className="mt">Draft</h3>
        {draft || firm.status === "researched" ? (
          <>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="No draft yet — generate one below." />
            <div className="mt row">
              <button type="button" onClick={generateDraft} disabled={busy === "draft"}>
                {busy === "draft" && <span className="spinner" />}
                {firm.draft_text ? "Regenerate" : "Generate draft"}
              </button>
              <button type="button" className="secondary" onClick={() => patch({ draft_text: draft }, "save")} disabled={busy === "save"}>
                {busy === "save" ? "Saving…" : "Save draft"}
              </button>
              <button type="button" className="secondary" onClick={() => copy(draft, "draft")} disabled={!draft}>
                {copied === "draft" ? "Copied ✓" : "Copy email"}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">This firm is phone-first or has no email — no draft expected.</p>
        )}

        <h3 className="mt">Status</h3>
        <div className="row">
          <select
            value={firm.status}
            onChange={(e) => patch({ status: e.target.value }, "status")}
            disabled={busy === "status"}
            style={{ width: "auto" }}
          >
            {FIRM_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          {firm.status !== "sent" && (
            <button type="button" onClick={() => patch({ status: "sent" }, "sent")} disabled={busy === "sent"}>
              Mark as sent
            </button>
          )}
        </div>

        {err && <p className="error">{err}</p>}
      </div>
    </div>
  );
}
