"use client";

import { useMemo, useState } from "react";

export default function AccessPage({ searchParams }: { searchParams: { next?: string } }) {
  const nextParam = searchParams?.next || "/";

  const nextSafe = useMemo(() => {
    if (nextParam === "/") return "/";
    if (nextParam.startsWith("/catalog/")) return nextParam;
    if (nextParam.startsWith("/checkout/")) return nextParam;
    return "/";
  }, [nextParam]);

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function go() {
    setMsg("");
    const p = phone.trim();
    if (!p) {
      setMsg("Inserisci il numero di cellulare.");
      return;
    }

    setLoading(true);
    try {
      // TENTA LOGIN DIRETTO
      const r = await fetch("/api/access/login-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: p }),
      });

      const j = await r.json().catch(() => ({}));

      if (r.ok && j?.ok) {
        window.location.href = nextSafe;
        return;
      }

      // QUALSIASI ERRORE → REGISTRAZIONE
      window.location.href =
        `/register?phone=${encodeURIComponent(p)}&next=${encodeURIComponent(nextSafe)}`;
    } catch {
      window.location.href =
        `/register?phone=${encodeURIComponent(p)}&next=${encodeURIComponent(nextSafe)}`;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="mb-6 flex justify-center">
        <img src="/logo.jpg" alt="Logo" className="h-20 w-auto" />
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Accesso clienti</h1>
        <p className="mt-2 text-sm text-gray-600">
          Inserisci il tuo numero di cellulare
        </p>

        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Cellulare"
          className="mt-4 w-full rounded-lg border px-4 py-3 text-lg"
          inputMode="tel"
        />

        {msg && <div className="mt-4 text-sm font-semibold">{msg}</div>}

        <button
          onClick={go}
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-lg font-bold text-white"
        >
          {loading ? "Attendere…" : "Continua"}
        </button>
      </div>
    </div>
  );
}
