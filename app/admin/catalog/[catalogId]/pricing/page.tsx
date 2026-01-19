"use client";

import { use, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Row = {
  id: string;
  progressive_number: number;
  box_number: string;
  image_path: string;
  is_published: boolean;
  price_eur: number | null;
};

export default function PricingPage(props: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = use(props.params);

  const [rows, setRows] = useState<Row[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  async function load() {
    setMsg("");
    const { data, error } = await supabaseBrowser
      .from("products")
      .select("id,progressive_number,box_number,image_path,is_published,price_eur")
      .eq("catalog_id", catalogId)
      .order("progressive_number", { ascending: true });

    if (error) {
      setMsg("Errore caricamento prodotti");
      return;
    }

    const list = (data as any[]) || [];
    setRows(list);

    const map: Record<string, string> = {};
    for (const r of list) {
      map[r.id] = r.price_eur === null || r.price_eur === undefined ? "" : String(r.price_eur);
    }
    setPrices(map);
  }

  useEffect(() => {
    load();
  }, [catalogId]);

  const notPricedCount = useMemo(() => {
    return rows.filter((r) => (prices[r.id] ?? "").trim() === "").length;
  }, [rows, prices]);

  async function saveAll() {
    setSaving(true);
    setMsg("");
    try {
      const payload = rows.map((r) => {
        const v = (prices[r.id] ?? "").trim().replace(",", ".");
        const n = v === "" ? null : Number(v);
        return { productId: r.id, price: n !== null && Number.isFinite(n) ? n : null };
      });

      const res = await fetch("/api/admin/save-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId, rows: payload }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || "Errore salvataggio");
        return;
      }

      setMsg("Prezzi salvati ✅");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setSaving(true);
    setMsg("");
    try {
      await saveAll();

      const res = await fetch("/api/admin/publish-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || "Errore pubblicazione");
        return;
      }

      setMsg("Catalogo pubblicato ✅ (solo prodotti con prezzo)");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-6 flex justify-center">
        <img src="/logo.jpg" alt="Logo azienda" className="h-20 w-auto" />
      </div>

      {/* NAV */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <a className="rounded-lg border bg-white px-4 py-2 font-semibold" href="/admin">
            ← Torna in Admin
          </a>
          <a
            className="rounded-lg border bg-white px-4 py-2 font-semibold"
            href={`/catalog/${catalogId}`}
            target="_blank"
            rel="noreferrer"
          >
            Apri catalogo cliente
          </a>
        </div>

        <div className="text-sm text-gray-600">
          Prodotti senza prezzo: <b>{notPricedCount}</b>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Prezzi catalogo</h1>

        <div className="flex gap-2">
          <button className="rounded-lg border bg-white px-4 py-2 font-semibold" disabled={saving} onClick={load}>
            Aggiorna
          </button>
          <button className="rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={saving} onClick={saveAll}>
            Salva prezzi
          </button>
          <button className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={saving} onClick={publish}>
            Conferma pubblicazione
          </button>
        </div>
      </div>

      {msg && <div className="mt-2 text-sm">{msg}</div>}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const imgUrl = `${base}/storage/v1/object/public/catalog-images/${r.image_path}`;
          const val = prices[r.id] ?? "";
          return (
            <div key={r.id} className="rounded-2xl border bg-white p-3 shadow-sm">
              <div className="relative">
                <img src={imgUrl} className="h-48 w-full rounded-xl object-cover" />
                <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white">
                  {r.progressive_number}
                </div>
                <div className="absolute left-2 bottom-2 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold">
                  Cassa {r.box_number}
                </div>
                {r.is_published && (
                  <div className="absolute right-2 top-2 rounded-md bg-green-600 px-2 py-1 text-xs font-bold text-white">
                    PUBBLICATO
                  </div>
                )}
              </div>

              <div className="mt-3">
                <label className="text-sm font-semibold">Prezzo €</label>
                <input
                  value={val}
                  onChange={(e) => setPrices((p) => ({ ...p, [r.id]: e.target.value }))}
                  placeholder="es. 35"
                  className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/30"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
