"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  name: string | null;
  company: string | null;
  phone: string;
  status: string | null;
  logins_30d: number;
  last_login: string | null;
  orders_30d: number;
  last_order: string | null;
};

function fmt(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export default function AdminStatsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/stats/overview?days=${days}`);
        const j = await res.json();
        setRows(j.customers || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.name, r.company, r.phone, r.status].some((x) => String(x || "").toLowerCase().includes(s))
    );
  }, [rows, q]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Statistiche</h1>
          <div className="text-sm opacity-70">Login e ordini ultimi {days} giorni</div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="w-full rounded border px-3 py-2 sm:w-72"
            placeholder="Cerca cliente / azienda / telefono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="rounded border px-3 py-2"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>7 giorni</option>
            <option value={14}>14 giorni</option>
            <option value={30}>30 giorni</option>
            <option value={60}>60 giorni</option>
            <option value={90}>90 giorni</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div>Caricamento...</div>
      ) : (
        <div className="overflow-auto rounded border">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                <th>Cliente</th>
                <th>Telefono</th>
                <th>Stato</th>
                <th>Login (30g)</th>
                <th>Ultimo login</th>
                <th>Ordini (30g)</th>
                <th>Ultimo ordine</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.phone} className="border-t [&>td]:px-3 [&>td]:py-2">
                  <td>
                    <div className="font-medium">{r.name || "-"}</div>
                    <div className="opacity-70">{r.company || ""}</div>
                  </td>
                  <td className="font-mono">{r.phone}</td>
                  <td>{r.status || "-"}</td>
                  <td>{r.logins_30d || 0}</td>
                  <td>{fmt(r.last_login)}</td>
                  <td>{r.orders_30d || 0}</td>
                  <td>{fmt(r.last_order)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr className="border-t">
                  <td className="px-3 py-6 opacity-70" colSpan={7}>
                    Nessun risultato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-sm opacity-70">
        Nota: i “Login” vengono tracciati quando il cliente chiama <span className="font-mono">/api/auth/login</span> e/o <span className="font-mono">/api/auth/me</span>.
      </div>
    </div>
  );
}
