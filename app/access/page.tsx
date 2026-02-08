"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AccessPage() {
  const sp = useSearchParams();
  const nextParam = sp.get("next") || "/";

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
    if (!p) return setMsg("Inserisci il tuo numero per confermare.");

    setLoading(true);
    try {
      const r = await fetch("/api/access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });

      const j = await r.json().catch(() => ({} as any));
      const loginUrl = j?.loginUrl || j?.approveUrl?.replace("/approve?", "/login?");
      if (!r.ok || !loginUrl) return setMsg(j?.error || "Errore richiesta accesso");

      const u = new URL(String(loginUrl), window.location.origin);
      u.searchParams.set("next", nextSafe);
      window.location.href = u.toString();
    } catch (e: any) {
      setMsg(e?.message || "Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="mb-4 flex justify-center">
        <img src="/logo.jpg" alt="Logo" className="h-16 w-auto" />
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-center">Conferma accesso</h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Inserisci il tuo numero per entrare.
        </p>

        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Cellulare (es. 348...)"
          className="mt-4 w-full rounded-lg border px-4 py-3 text-lg"
          inputMode="tel"
        />

        {msg ? <div className="mt-3 text-sm text-red-600">{msg}</div> : null}

        <button
          onClick={go}
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-lg font-bold text-white disabled:opacity-50"
        >
          {loading ? "Attendere…" : "Entra"}
        </button>
      </div>
    </div>
  );
}
