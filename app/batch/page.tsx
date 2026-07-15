"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ParsedFirm } from "@/lib/firm";
import { pool } from "@/lib/ui";

type Phase = "input" | "preview" | "running" | "done";
const LS_KEY = "oe_active_batch";

export default function BatchPage() {
  const [phase, setPhase] = useState<Phase>("input");
  const [input, setInput] = useState("");
  const [sourceType, setSourceType] = useState<"text" | "csv">("text");
  const [batchName, setBatchName] = useState("");
  const [targetRole, setTargetRole] = useState("Managing Partner");
  const [concurrency, setConcurrency] = useState(4);

  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedFirm[]>([]);
  const [included, setIncluded] = useState<boolean[]>([]);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const runningRef = useRef(false);

  // On mount, offer to resume an in-flight batch.
  useEffect(() => {
    const id = localStorage.getItem(LS_KEY);
    if (!id) return;
    fetch(`/api/batch/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.pendingIds && j.pendingIds.length > 0) {
          setResumeId(id);
        } else {
          localStorage.removeItem(LS_KEY);
        }
      })
      .catch(() => {});
  }, []);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceType("csv");
    const reader = new FileReader();
    reader.onload = () => setInput(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function parse() {
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/batch/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, sourceType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed.");
      const firms: ParsedFirm[] = data.firms;
      setParsed(firms);
      // Default: exclude duplicates, include everything else.
      setIncluded(firms.map((f) => !f.duplicate));
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed.");
    } finally {
      setParsing(false);
    }
  }

  async function processAll(ids: string[]) {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase("running");
    await pool(ids, concurrency, async (id) => {
      try {
        const res = await fetch(`/api/batch/process/${id}`, { method: "POST" });
        const data = await res.json();
        const status = res.ok && data.status ? data.status : "error";
        setCounts((c) => ({ ...c, [status]: (c[status] ?? 0) + 1 }));
      } catch {
        setCounts((c) => ({ ...c, error: (c.error ?? 0) + 1 }));
      } finally {
        setProcessed((p) => p + 1);
      }
    });
    runningRef.current = false;
    localStorage.removeItem(LS_KEY);
    setPhase("done");
  }

  async function createAndRun() {
    setError(null);
    const firms = parsed.filter((_, i) => included[i]);
    if (firms.length === 0) {
      setError("Select at least one firm.");
      return;
    }
    try {
      const res = await fetch("/api/batch/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firms, targetRole, sourceType, name: batchName || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch creation failed.");
      const ids: string[] = data.firms.map((f: { id: string }) => f.id);
      setBatchId(data.batchId);
      setTotal(ids.length);
      setProcessed(0);
      setCounts({});
      localStorage.setItem(LS_KEY, data.batchId);
      processAll(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch creation failed.");
    }
  }

  async function resume() {
    if (!resumeId) return;
    setError(null);
    try {
      const res = await fetch(`/api/batch/${resumeId}`);
      const data = await res.json();
      const ids: string[] = data.pendingIds ?? [];
      setBatchId(resumeId);
      setTotal(ids.length);
      setProcessed(0);
      setCounts({});
      setResumeId(null);
      processAll(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume failed.");
    }
  }

  const includedCount = included.filter(Boolean).length;

  return (
    <main>
      <h1>Batch pipeline</h1>
      <p className="subtitle">
        Upload a register, review the parse, then research every firm automatically.
      </p>

      {resumeId && phase === "input" && (
        <div className="panel resume-banner">
          <span>An unfinished batch was found.</span>
          <button type="button" onClick={resume}>Resume it</button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              localStorage.removeItem(LS_KEY);
              setResumeId(null);
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Phase: input */}
      {phase === "input" && (
        <section className="panel">
          <label htmlFor="name">Batch name (optional)</label>
          <input
            id="name"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="LSRA register — July"
          />

          <label htmlFor="role">Target role</label>
          <input
            id="role"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
          />

          <label htmlFor="csv">Upload CSV</label>
          <input id="csv" type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />

          <label htmlFor="paste">…or paste the register text</label>
          <textarea
            id="paste"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setSourceType("text");
            }}
            placeholder="Paste rows copied from a PDF register or a CSV…"
            style={{ minHeight: 200 }}
          />

          <div className="mt row">
            <button type="button" onClick={parse} disabled={parsing || !input.trim()}>
              {parsing && <span className="spinner" />}
              {parsing ? "Parsing…" : "Parse register"}
            </button>
          </div>
        </section>
      )}

      {/* Phase: preview */}
      {phase === "preview" && (
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{parsed.length} firms parsed — {includedCount} selected</strong>
            <div className="row">
              <label htmlFor="conc" style={{ margin: 0 }}>Concurrency</label>
              <input
                id="conc"
                type="number"
                min={1}
                max={8}
                value={concurrency}
                onChange={(e) => setConcurrency(Math.max(1, Math.min(8, Number(e.target.value))))}
                style={{ width: 70 }}
              />
            </div>
          </div>
          <p className="muted">Duplicates (already in your database) are unchecked by default.</p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Firm</th>
                  <th>Location</th>
                  <th>Partners</th>
                  <th>Website</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((f, i) => (
                  <tr key={i} className={f.duplicate ? "dupe" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={included[i]}
                        onChange={() =>
                          setIncluded((arr) => arr.map((v, j) => (j === i ? !v : v)))
                        }
                      />
                    </td>
                    <td>
                      {f.firm_name}
                      {f.duplicate && <span className="badge st-muted" style={{ marginLeft: 6 }}>dupe</span>}
                    </td>
                    <td className="muted">{f.location ?? "—"}</td>
                    <td className="muted">{f.partner_names.join(", ") || "—"}</td>
                    <td className="muted">{f.website_url ? "given" : "search"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt row">
            <button type="button" onClick={createAndRun} disabled={includedCount === 0}>
              Research {includedCount} firms
            </button>
            <button type="button" className="secondary" onClick={() => setPhase("input")}>
              Back
            </button>
          </div>
        </section>
      )}

      {/* Phase: running / done */}
      {(phase === "running" || phase === "done") && (
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>
              {phase === "done" ? "Batch complete" : "Processing…"} — {processed} of {total}
            </strong>
            {phase === "running" && <span className="spinner" />}
          </div>

          <div className="progress mt">
            <div
              className="progress-bar"
              style={{ width: total ? `${(processed / total) * 100}%` : "0%" }}
            />
          </div>

          <div className="mt row" style={{ gap: 16, flexWrap: "wrap" }}>
            <span className="counter st-green">send-ready: {counts.researched ?? 0}</span>
            <span className="counter st-amber">phone-first: {counts.phone_first ?? 0}</span>
            <span className="counter st-red">no website: {counts.no_website_found ?? 0}</span>
            {counts.error ? <span className="counter st-red">errors: {counts.error}</span> : null}
          </div>

          {phase === "done" && (
            <div className="mt row">
              <Link href="/hub"><button type="button">Open Outreach Hub</button></Link>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPhase("input");
                  setInput("");
                  setParsed([]);
                  setBatchId(null);
                }}
              >
                Start another batch
              </button>
            </div>
          )}
        </section>
      )}

      {error && <p className="error">{error}</p>}
      {batchId && <p className="muted">Batch ID: {batchId}</p>}
    </main>
  );
}
