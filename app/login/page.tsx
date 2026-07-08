"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Login failed.");
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Outreach Engine</h1>
      <p className="subtitle">Enter the password to continue.</p>
      <form className="panel" onSubmit={submit}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <div className="mt">
          <button type="submit" disabled={busy || !password}>
            {busy ? "Checking…" : "Enter"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
