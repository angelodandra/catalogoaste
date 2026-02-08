"use client";

import { useState } from "react";

export default function RegisterPage({ searchParams }: { searchParams: { phone?: string; next?: string } }) {
  const [phone, setPhone] = useState(searchParams?.phone || "");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setMsg("");
    if (!phone || !name) {
      setMsg("Inserisci almeno nome e cellulare.");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/access/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name, company }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j?.error || "Errore registrazione");
        return;
      }

      setMsg("Registrazione inviata. Attendi conferma su WhatsApp.");
    } catch {
      setMsg("Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="mb-6 flex justify-center">
        <img src="/logo.jpg" className="h-20" />
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Registrazione cliente</h1>

        <input
          className="mt-4 w-full rounded-lg border px-4 py-3"
          placeholder="Cellulare"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <input
          className="mt-3 w-full rounded-lg border px-4 py-3"
          placeholder="Nome e cognome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="mt-3 w-full rounded-lg border px-4 py-3"
          placeholder="Azienda (opzionale)"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />

        {msg && <div className="mt-3 text-sm font-semibold">{msg}</div>}

        <button
          onClick={submit}
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-lg font-bold text-white"
        >
          {loading ? "Invio…" : "Registrati"}
        </button>
      </div>
    </div>
  );
}
