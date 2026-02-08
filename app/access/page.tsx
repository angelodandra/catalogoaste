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
      const r = await fetch("/api/access/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });

      const j = await r.json().catch(() => ({} as any));

      const exists = !!(j?.exists ?? j?.customerExists ?? j?.found ?? j?.ok);
      const status = String(j?.status || j?.customer?.status || "").toLowerCase();

      if (!exists) {
        window.location.href = `/register?phone=${encodeURIComponent(p)}&next=${encodeURIComponent(nextSafe)}`;
        return;
      }

      if (status && status !== "active") {
        setMsg("Numero registrato ma non ancora autorizzato. Attendi conferma.");
        return;
      }

      const l = await fetch("/api/access/login-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: p }),
      });

      const lj = await l.json().catch(() => ({} as any));
      if (!l.ok || !lj?.ok) {
        setMsg(lj?.error || "Errore accesso. Riprova.");
        return;
      }

      window.location.href = nextSafe;
    } catch {
      window.location.href = `/register?phone=${encodeURIComponent(p)}&next=${encodeURIComponent(nextSafe)}`;
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
        <h1 className="text-xl font-bold">Accedi</h1>
        <p className="mt-2 text-sm text-gray-600">Inserisci il tuo numero per continuare.</p>

        <div className="mt-4">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Cellulare (es. 348...)"
            className="w-full rounded-lg border px-4 py-3 text-lg"
            inputMode="tel"
          />
        </div>

        {msg ? <div className="mt-4 text-sm font-semibold">{msg}</div> : null}

        <button
          onClick={go}
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-lg font-bold text-white disabled:opacity-50"
        >
          {loading ? "Attendere…" : "Continua"}
        </button>
      </div>
    </div>
  );
}
