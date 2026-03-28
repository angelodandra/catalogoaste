"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";

type Row = {
  name: string | null;
  company: string | null;
  phone: string;
  status: string | null;
  created_at: string | null;
  logins_30d: number;
  last_login: string | null;
  orders_30d: number;
  last_order: string | null;
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type SortKey = "name" | "orders_30d" | "logins_30d" | "last_order" | "last_login" | "created_at";

export default function AdminStatsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("orders_30d");
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { supabaseBrowser } = await import("@/lib/supabaseBrowser");
        const { data: sessionData } = await supabaseBrowser().auth.getSession();
        const token = sessionData?.session?.access_token;
        const res = await adminFetch(`/api/admin/stats/overview?days=${days}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const j = await res.json();
        setRows(j.customers || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let data = s
      ? rows.filter((r) => [r.name, r.company, r.phone, r.status].some((x) => String(x || "").toLowerCase().includes(s)))
      : [...rows];

    data.sort((a, b) => {
      let va: any = a[sortKey];
      let vb: any = b[sortKey];
      if (sortKey === "orders_30d" || sortKey === "logins_30d") {
        va = Number(va || 0); vb = Number(vb || 0);
      } else if (sortKey === "last_order" || sortKey === "last_login" || sortKey === "created_at") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      } else {
        va = String(va || "").toLowerCase(); vb = String(vb || "").toLowerCase();
      }
      if (va < vb) return sortDesc ? 1 : -1;
      if (va > vb) return sortDesc ? -1 : 1;
      return 0;
    });

    return data;
  }, [rows, q, sortKey, sortDesc]);

  // ── Statistiche aggregate ──
  const stats = useMemo(() => {
    const attivi = rows.filter((r) => (r.status || "").toLowerCase() === "active").length;
    const totOrdini = rows.reduce((a, r) => a + (r.orders_30d || 0), 0);
    const totLogin = rows.reduce((a, r) => a + (r.logins_30d || 0), 0);
    const conOrdini = rows.filter((r) => r.orders_30d > 0).length;
    const senzaOrdini = rows.filter((r) => (r.status || "").toLowerCase() === "active" && r.orders_30d === 0).length;
    return { attivi, totOrdini, totLogin, conOrdini, senzaOrdini };
  }, [rows]);

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDesc ? "↓" : "↑"}</span>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/admin" className="rounded border px-3 py-1 text-sm hover:bg-gray-50">← Admin</Link>
          </div>
          <h1 className="text-2xl font-semibold">Statistiche</h1>
          <div className="text-sm text-gray-500">Ultimi {days} giorni · {rows.length} clienti totali</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="w-full rounded border px-3 py-2 sm:w-64"
            placeholder="Cerca cliente / azienda / telefono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="rounded border px-3 py-2" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 giorni</option>
            <option value={14}>14 giorni</option>
            <option value={30}>30 giorni</option>
            <option value={60}>60 giorni</option>
            <option value={90}>90 giorni</option>
          </select>
        </div>
      </div>

      {/* Cards riepilogo */}
      {!loading && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-green-600">{stats.attivi}</div>
            <div className="mt-1 text-xs text-gray-500">Clienti attivi</div>
          </div>
          <div className="rounded-xl border bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-blue-600">{stats.totOrdini}</div>
            <div className="mt-1 text-xs text-gray-500">Ordini periodo</div>
          </div>
          <div className="rounded-xl border bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold">{stats.totLogin}</div>
            <div className="mt-1 text-xs text-gray-500">Accessi periodo</div>
          </div>
          <div className="rounded-xl border bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-indigo-600">{stats.conOrdini}</div>
            <div className="mt-1 text-xs text-gray-500">Clienti con ordini</div>
          </div>
          <div className="rounded-xl border bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-orange-500">{stats.senzaOrdini}</div>
            <div className="mt-1 text-xs text-gray-500">Attivi senza ordini</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">Caricamento...</div>
      ) : (
        <div className="overflow-auto rounded-xl border shadow-sm">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr className="[&>th]:px-3 [&>th]:py-3 [&>th]:text-left">
                <th className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                  Cliente <SortArrow k="name" />
                </th>
                <th>Telefono</th>
                <th>Stato</th>
                <th className="cursor-pointer select-none" onClick={() => toggleSort("created_at")}>
                  Registrato <SortArrow k="created_at" />
                </th>
                <th className="cursor-pointer select-none text-right" onClick={() => toggleSort("orders_30d")}>
                  Ordini <SortArrow k="orders_30d" />
                </th>
                <th className="cursor-pointer select-none" onClick={() => toggleSort("last_order")}>
                  Ultimo ordine <SortArrow k="last_order" />
                </th>
                <th className="cursor-pointer select-none text-right" onClick={() => toggleSort("logins_30d")}>
                  Accessi <SortArrow k="logins_30d" />
                </th>
                <th className="cursor-pointer select-none" onClick={() => toggleSort("last_login")}>
                  Ultimo accesso <SortArrow k="last_login" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => {
                const st = (r.status || "").toLowerCase();
                const isActive = st === "active";
                const isPending = st === "pending";
                return (
                  <tr key={r.phone} className="hover:bg-gray-50 [&>td]:px-3 [&>td]:py-2.5">
                    <td>
                      <div className="font-medium">{r.name || "—"}</div>
                      {r.company && <div className="text-xs text-gray-500">{r.company}</div>}
                    </td>
                    <td className="font-mono text-xs">{r.phone}</td>
                    <td>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold
                        ${isActive ? "bg-green-100 text-green-700"
                        : isPending ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-600"}`}>
                        {r.status || "—"}
                      </span>
                    </td>
                    <td className="text-gray-500">{fmtDate(r.created_at)}</td>
                    <td className="text-right">
                      {r.orders_30d > 0
                        ? <span className="inline-flex items-center justify-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{r.orders_30d}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="text-gray-500">{fmt(r.last_order)}</td>
                    <td className="text-right">
                      {r.logins_30d > 0
                        ? <span className="text-xs font-semibold">{r.logins_30d}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="text-gray-500">{fmt(r.last_login)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-gray-400" colSpan={8}>Nessun risultato.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
