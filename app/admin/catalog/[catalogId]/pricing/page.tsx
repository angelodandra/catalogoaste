"use client";

import { use, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  progressive_number: number;
  box_number: string;
  image_path: string;
  is_published: boolean;
  price_eur: number | null;
  weight_kg: number | null;
  peso_interno_kg: number | null;
};

export default function PricingPage(props: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = use(props.params);
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string>("");

  const [pesiFile, setPesiFile] = useState<File | null>(null);
  const [pesiPreview, setPesiPreview] = useState<any | null>(null);
  const [pesiLoading, setPesiLoading] = useState(false);

  async function runImportPesi(mode: "preview" | "apply") {
    if (!pesiFile) {
      setMsg("Seleziona un file pesi (CSV o XLSX)");
      return;
    }
    setPesiLoading(true);
    setMsg(mode === "preview" ? "Anteprima import pesi…" : "Applico pesi…");
    try {
      const fd = new FormData();
      fd.append("catalogId", catalogId);
      fd.append("mode", mode);
      fd.append("file", pesiFile);

      const res = await adminFetch("/api/admin/import-pesi", { method: "POST", body: fd });
      const json = await res.json();

      if (!res.ok) {
        setMsg(json.error || "Errore import pesi");
        setPesiPreview(null);
        return;
      }

      setPesiPreview(json);
      setMsg(mode === "preview" ? "Anteprima pronta ✅" : `Pesi applicati ✅ (aggiornati: ${json.updatedCount ?? 0})`);
      await load(true);
    } catch (e: any) {
      setMsg(String(e?.message || e || "Errore"));
    } finally {
      setPesiLoading(false);
    }
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  function nowHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function load(silent: boolean = false) {
    if (!silent) setMsg("Carico…");
    const { data, error } = await supabaseBrowser()
      .from("products")
      .select("id,progressive_number,box_number,image_path,is_published,price_eur,weight_kg,peso_interno_kg")
      .eq("catalog_id", catalogId)
      .order("progressive_number", { ascending: true });

    if (error) {
      setMsg("Errore caricamento prodotti");
      return;
    }

    const list = (data as any[]) || [];
    setRows(list);

    const priceMap: Record<string, string> = {};
    const weightMap: Record<string, string> = {};

    for (const r of list) {
      priceMap[r.id] = r.price_eur == null ? "" : String(r.price_eur);
      weightMap[r.id] = r.weight_kg == null ? "" : String(r.weight_kg);
    }

    setPrices(priceMap);
    setWeights(weightMap);
  }

  useEffect(() => {
    load();
  }, [catalogId]);

  const notPricedCount = useMemo(
    () => rows.filter((r) => (prices[r.id] ?? "").trim() === "").length,
    [rows, prices]
  );

  async function saveAll() {
    setSaving(true);
    setMsg("Salvo…");
    try {
      const payload = rows.map((r) => {
        const pv = (prices[r.id] ?? "").trim().replace(",", ".");
        const price = pv === "" ? null : Number(pv);

        const wv = (weights[r.id] ?? "").trim().replace(",", ".");
        const weightKg = wv === "" ? null : Number(wv);

        return {
          productId: r.id,
          price: Number.isFinite(price) ? price : null,
          weightKg: Number.isFinite(weightKg) ? weightKg : null,
        };
      });

      const res = await adminFetch("/api/admin/save-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId, rows: payload }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || "Errore salvataggio");
        return;
      }

      setMsg("Prezzi e pesi salvati ✅");
      await load(true);
    } catch (e: any) {
      setMsg(String(e?.message || e || 'Errore'));
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setSaving(true);
    setMsg("Pubblico…");
    try {
      await saveAll();

      const res = await adminFetch("/api/admin/publish-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || "Errore pubblicazione");
        return;
      }

      setMsg("Catalogo pubblicato ✅");
      await load(true);
    } catch (e: any) {
      setMsg(String(e?.message || e || 'Errore'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      {/* TORNA_ADMIN_STICKY */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
            onClick={() => router.push('/admin')}
          >
            ← Admin
          </button>
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
            onClick={() => router.push(`/admin/catalog/${catalogId}/listino`)}
          >
            ← Catalogo (Admin)
          </button>
        </div>
      </div>

      <h1 className="mb-4 text-2xl font-bold">Prezzi catalogo</h1>

      <div className="mb-3 text-sm text-gray-600">
        Prodotti senza prezzo: <b>{notPricedCount}</b>
      </div>

      <div className="mb-4 rounded-xl border bg-white p-3">
        <div className="text-sm font-semibold">Import pesi interni (CSV/XLSX)</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setPesiFile(e.target.files?.[0] ?? null)}
            className="w-full rounded border px-3 py-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => runImportPesi("preview")}
              disabled={pesiLoading || !pesiFile}
              className="rounded border bg-white px-4 py-2 font-semibold disabled:opacity-60"
            >
              Anteprima
            </button>
            <button
              type="button"
              onClick={() => runImportPesi("apply")}
              disabled={pesiLoading || !pesiFile}
              className="rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              Applica
            </button>
          </div>
        </div>

        {pesiPreview?.totals && (
          <div className="mt-2 text-sm text-gray-700">
            <div>
              Letti: <b>{pesiPreview.totals.rowsRead ?? "—"}</b> — Validi:{" "}
              <b>{pesiPreview.totals.validUnique ?? "—"}</b> — Match: <b>{pesiPreview.totals.matched ?? "—"}</b>
            </div>
            <div>
              Non trovati: <b>{pesiPreview.totals.notFound ?? "—"}</b> — Invalidi: <b>{pesiPreview.totals.invalid ?? "—"}</b>{" "}
              — Mancanti nel file: <b>{pesiPreview.totals.missingInFile ?? "—"}</b>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <button onClick={() => load()} disabled={saving} className="rounded border px-4 py-2">
          Aggiorna
        </button>
        <button onClick={saveAll} disabled={saving} className="rounded bg-black px-4 py-2 text-white">
          Salva
        </button>
        <button onClick={publish} disabled={saving} className="rounded bg-green-600 px-4 py-2 text-white">
          Pubblica
        </button>
      </div>

      {msg && <div className="mb-2 text-sm">{msg}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border bg-white p-3">
            <img
              src={`${base}/storage/v1/object/public/catalog-images/${r.image_path}`}
              className="h-40 w-full rounded-lg object-cover"
            />

            <div className="mt-2 text-sm text-gray-700">
              <div><b>Cassa</b>: {r.progressive_number}{r.box_number ? ` (${r.box_number})` : ""}</div>
              <div><b>Peso interno</b>: {r.peso_interno_kg == null ? "—" : `${r.peso_interno_kg} kg`}</div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                placeholder="Prezzo €"
                value={prices[r.id] ?? ""}
                onChange={(e) => setPrices((p) => ({ ...p, [r.id]: e.target.value }))}
                className="rounded border px-3 py-2"
              />
              <input
                placeholder="Peso kg"
                value={weights[r.id] ?? ""}
                onChange={(e) => setWeights((p) => ({ ...p, [r.id]: e.target.value }))}
                className="rounded border px-3 py-2"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
