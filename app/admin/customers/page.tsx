"use client";

import { useEffect, useMemo, useState } from "react";

type Customer = {
  id: string;
  name: string;
  company: string;
  phone: string;
  status: "active" | "revoked";
  created_at: string;
  updated_at: string;
};

export default function AdminCustomersPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);

  async function load(query = "") {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/list?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Errore caricamento");
      setCustomers(json.customers || []);
    } catch (e: any) {
      alert(e?.message ?? "Errore rete");
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(customerId: string, status: "active" | "revoked") {
    if (!confirm(status === "revoked" ? "Revoco questo cliente?" : "Riattivo questo cliente?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/customers/set-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Errore aggiornamento");

      // aggiorna lista localmente
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? json.customer : c)));
    } catch (e: any) {
      alert(e?.message ?? "Errore rete");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
  }, []);

  const activeCount = useMemo(() => customers.filter((c) => c.status === "active").length, [customers]);

  return (
    <div className="mx-auto max-w-5xl p-4">
      
      <div className="mb-4 flex items-center gap-3">
        <a href="/admin" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50">
          ← Torna ad Admin
        </a>
        <a href="/admin/orders" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50">
          Ordini
        </a>
      </div>
<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold">Clienti</div>
          <div className="text-sm text-gray-600">
            Totale: <b>{customers.length}</b> • Attivi: <b>{activeCount}</b>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            className="w-64 rounded-lg border px-3 py-2 text-sm"
            placeholder="Cerca: nome, azienda, telefono..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={loading}
            onClick={() => load(q)}
          >
            Cerca
          </button>
          <button
            className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={loading}
            onClick={() => { setQ(""); load(""); }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {customers.map((c) => (
          <div key={c.id} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-lg font-bold">{c.company}</div>
                <div className="text-sm text-gray-700">
                  <b>{c.name}</b> • <span className="font-mono">{c.phone}</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Creato: {new Date(c.created_at).toLocaleString("it-IT")} • Aggiornato:{" "}
                  {new Date(c.updated_at).toLocaleString("it-IT")}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className={
                    "rounded-full px-3 py-1 text-xs font-bold " +
                    (c.status === "active"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-red-50 text-red-800 border border-red-200")
                  }
                >
                  {c.status === "active" ? "ATTIVO" : "REVOCATO"}
                </span>

                {c.status === "active" ? (
                  <button
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800 disabled:opacity-60"
                    disabled={loading}
                    onClick={() => setStatus(c.id, "revoked")}
                  >
                    Revoca
                  </button>
                ) : (
                  <button
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-60"
                    disabled={loading}
                    onClick={() => setStatus(c.id, "active")}
                  >
                    Riattiva
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {customers.length === 0 && (
          <div className="rounded-2xl border bg-gray-50 p-6 text-center text-sm text-gray-700">
            Nessun cliente trovato.
          </div>
        )}
      </div>
    </div>
  );
}
