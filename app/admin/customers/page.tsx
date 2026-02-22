"use client";

import { useEffect, useMemo, useState } from "react";
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
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  if (data?.session?.access_token) {
    return data.session.access_token;
  }
  return null;
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
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clienti</h1>
          <div className="text-sm opacity-70">
            Totale: {rows.length} • Attivi: {rows.filter((x) => (x.status || "").toLowerCase() === "active").length}
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
            className="rounded border px-3 py-2"
            onClick={() => load(query)}
            disabled={loading}
          >
            Cerca
          </button>
          <button
            className="rounded border px-3 py-2"
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
                <th className="w-[240px]">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = (c.status || "").toLowerCase();
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
                        className="rounded border px-3 py-1"
                        disabled={loading || st === "active"}
                        onClick={() => setStatus(c.id, "active")}
                      >
                        Approva
                      </button>
                      <button
                        className="rounded border px-3 py-1"
                        disabled={loading || st === "revoked"}
                        onClick={() => setStatus(c.id, "revoked")}
                      >
                        Revoca
                      </button>
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
