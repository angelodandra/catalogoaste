"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Customer = {
  id: string;
  name: string | null;
  company: string | null;
  phone: string;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

async function getAdminToken(): Promise<string | null> {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const token = await getAdminToken();
  const headers: Record<string, string> = {
    ...(init?.headers as any),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(input, { ...init, headers });
}

export default function AdminCustomersPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // indica quale riga è in azione (approva/revoca) per dare feedback UI
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((c) =>
      [c.name, c.company, c.phone, c.status].some((x) =>
        String(x || "").toLowerCase().includes(s)
      )
    );
  }, [rows, query]);

  async function load(q?: string) {
    setLoading(true);
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await adminFetch(`/api/admin/customers/list${qs}`);
      const j = await res.json();
      if (!res.ok) {
        alert(j?.error || "Errore");
        setRows([]);
        return;
      }
      setRows(j.customers || []);
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(customerId: string, status: "active" | "revoked") {
    setBusyId(customerId);
    try {
      const res = await adminFetch("/api/admin/customers/set-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, status }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        alert(j?.error || "Errore");
        return;
      }
      await load(query);
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCount = rows.filter((x) => (x.status || "").toLowerCase() === "active").length;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded border px-3 py-1 text-sm hover:bg-gray-50"
            >
              ← Torna ad Admin
            </Link>
          </div>

          <h1 className="text-2xl font-semibold">Clienti</h1>
          <div className="text-sm opacity-70">
            Totale: {rows.length} • Attivi: {activeCount}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="w-full rounded border px-3 py-2 sm:w-80"
            placeholder="Cerca: nome, azienda, telefono..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="rounded border px-3 py-2 hover:bg-gray-50 disabled:opacity-60"
            onClick={() => load(query)}
            disabled={loading}
          >
            {loading ? "..." : "Cerca"}
          </button>
          <button
            className="rounded border px-3 py-2 hover:bg-gray-50 disabled:opacity-60"
            onClick={() => {
              setQuery("");
              load("");
            }}
            disabled={loading}
          >
            Reset
          </button>
        </div>
      </div>

      {loading ? (
        <div>Caricamento...</div>
      ) : (
        <div className="overflow-auto rounded border">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                <th>Cliente</th>
                <th>Telefono</th>
                <th>Stato</th>
                <th className="w-[260px]">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = (c.status || "").toLowerCase();
                const busy = busyId === c.id;

                return (
                  <tr key={c.id} className="border-t [&>td]:px-3 [&>td]:py-2">
                    <td>
                      <div className="font-medium">{c.name || "-"}</div>
                      <div className="opacity-70">{c.company || ""}</div>
                    </td>
                    <td className="font-mono">{c.phone}</td>
                    <td>{c.status || "-"}</td>
                    <td className="flex gap-2">
                      <button
                        className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-60"
                        disabled={loading || busy || st === "active"}
                        onClick={() => setStatus(c.id, "active")}
                      >
                        {busy && st !== "active" ? "..." : "Approva"}
                      </button>
                      <button
                        className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-60"
                        disabled={loading || busy || st === "revoked"}
                        onClick={() => setStatus(c.id, "revoked")}
                      >
                        {busy && st !== "revoked" ? "..." : "Revoca"}
                      </button>
                      {busy && <span className="self-center text-xs opacity-70">Aggiorno…</span>}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr className="border-t">
                  <td className="px-3 py-6 opacity-70" colSpan={4}>
                    Nessun cliente trovato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
