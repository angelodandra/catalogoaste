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
  specie: string | null;
  numero_interno_cassa: string | null;
  cost_eur: number | null;
  auction_total_eur: number | null;
  auction_price_per_kg: number | null;
  auction_boxes_count: number | null;
};

type AstaType = "civitavecchia" | "none";

const ASTA_DEFAULTS: Record<AstaType, { boxCost: string; transportBoxCost: string; commissionRate: string }> = {
  civitavecchia: { boxCost: "1", transportBoxCost: "2", commissionRate: "2" },
  none: { boxCost: "0", transportBoxCost: "0", commissionRate: "0" },
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

  // Import da listino aste (PDF / XLSX acquisti)
  const [asteFile, setAsteFile] = useState<File | null>(null);
  const [asteProgressiveStart, setAsteProgressiveStart] = useState<string>("");
  const [astePreview, setAstePreview] = useState<any | null>(null);
  const [asteLoading, setAsteLoading] = useState(false);

  // Tipo asta + parametri formula costo
  const [astaType, setAstaType] = useState<AstaType>("civitavecchia");
  const [boxCost, setBoxCost] = useState<string>(ASTA_DEFAULTS.civitavecchia.boxCost);
  const [transportBoxCost, setTransportBoxCost] = useState<string>(
    ASTA_DEFAULTS.civitavecchia.transportBoxCost
  );
  const [commissionRate, setCommissionRate] = useState<string>(
    ASTA_DEFAULTS.civitavecchia.commissionRate
  );

  function onAstaTypeChange(next: AstaType) {
    setAstaType(next);
    const d = ASTA_DEFAULTS[next];
    setBoxCost(d.boxCost);
    setTransportBoxCost(d.transportBoxCost);
    setCommissionRate(d.commissionRate);
  }

  async function runImportAste(mode: "preview" | "apply") {
    if (!asteFile) {
      setMsg("Seleziona un file listino aste (PDF o XLSX)");
      return;
    }
    setAsteLoading(true);
    setMsg(mode === "preview" ? "Anteprima listino aste…" : "Applico listino aste…");
    try {
      const fd = new FormData();
      fd.append("catalogId", catalogId);
      fd.append("mode", mode);
      fd.append("file", asteFile);
      if (asteProgressiveStart.trim()) {
        fd.append("progressiveStart", asteProgressiveStart.trim());
      }
      // Parametri asta (per il calcolo costo lato server)
      fd.append("astaType", astaType);
      if (astaType === "civitavecchia") {
        fd.append("boxCost", boxCost.replace(",", "."));
        fd.append("transportBoxCost", transportBoxCost.replace(",", "."));
        fd.append("commissionRate", commissionRate.replace(",", "."));
      }

      const res = await adminFetch("/api/admin/parse-aste-source", { method: "POST", body: fd });
      const json = await res.json();

      if (!res.ok) {
        setMsg(json.error || "Errore import listino");
        setAstePreview(null);
        return;
      }

      setAstePreview(json);
      setMsg(
        mode === "preview"
          ? `Anteprima pronta ✅ — ${json.totals?.matched ?? 0} lotti abbinati${
              json.totals?.withCost ? `, costi calcolati: ${json.totals.withCost}` : ""
            }`
          : `Listino applicato ✅ — aggiornati: ${json.updatedCount ?? 0}`
      );
      if (mode === "apply") await load(true);
    } catch (e: any) {
      setMsg(String(e?.message || e || "Errore"));
    } finally {
      setAsteLoading(false);
    }
  }

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
      .select(
        "id,progressive_number,box_number,image_path,is_published,price_eur,weight_kg,peso_interno_kg,specie,numero_interno_cassa,cost_eur,auction_total_eur,auction_price_per_kg,auction_boxes_count"
      )
      .eq("catalog_id", catalogId)
      .order("progressive_number", { ascending: true });

    if (error) {
      // Fallback in caso la migrazione costo non sia ancora applicata: rileggi senza i campi nuovi
      const fallback = await supabaseBrowser()
        .from("products")
        .select(
          "id,progressive_number,box_number,image_path,is_published,price_eur,weight_kg,peso_interno_kg,specie,numero_interno_cassa"
        )
        .eq("catalog_id", catalogId)
        .order("progressive_number", { ascending: true });

      if (fallback.error) {
        setMsg("Errore caricamento prodotti");
        return;
      }
      const list = (fallback.data as any[]) || [];
      setRows(
        list.map((r) => ({
          ...r,
          cost_eur: null,
          auction_total_eur: null,
          auction_price_per_kg: null,
          auction_boxes_count: null,
        }))
      );

      const priceMap: Record<string, string> = {};
      const weightMap: Record<string, string> = {};
      for (const r of list) {
        priceMap[r.id] = r.price_eur == null ? "" : String(r.price_eur);
        weightMap[r.id] = r.weight_kg == null ? "" : String(r.weight_kg);
      }
      setPrices(priceMap);
      setWeights(weightMap);

      setMsg(
        "⚠️ Migrazione costo asta non applicata. Esegui migration_costo_asta.sql in Supabase per attivare costo e ricarico %."
      );
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
    // Carico tipo asta + parametri salvati sul catalogo (se presenti)
    (async () => {
      const { data, error } = await supabaseBrowser()
        .from("catalogs")
        .select("asta_type, asta_params")
        .eq("id", catalogId)
        .maybeSingle();
      if (error || !data) return;
      const t = (data as any).asta_type as string | null;
      if (t === "civitavecchia") {
        setAstaType("civitavecchia");
        const p = ((data as any).asta_params || {}) as any;
        if (p.boxCost != null) setBoxCost(String(p.boxCost));
        if (p.transportBoxCost != null) setTransportBoxCost(String(p.transportBoxCost));
        if (p.commissionRate != null) setCommissionRate(String(p.commissionRate));
      }
    })();
  }, [catalogId]);

  const notPricedCount = useMemo(
    () => rows.filter((r) => (prices[r.id] ?? "").trim() === "").length,
    [rows, prices]
  );

  const withCostCount = useMemo(() => rows.filter((r) => r.cost_eur != null).length, [rows]);

  /** Calcola il ricarico % a partire da prezzo di vendita e costo */
  function computeMarkup(priceStr: string, cost: number | null): { value: number | null; pct: number | null } {
    if (cost == null || cost <= 0) return { value: null, pct: null };
    const pv = (priceStr ?? "").trim().replace(",", ".");
    if (pv === "") return { value: null, pct: null };
    const price = Number(pv);
    if (!Number.isFinite(price)) return { value: null, pct: null };
    const margin = price - cost;
    const pct = (margin / cost) * 100;
    return { value: Math.round(margin * 100) / 100, pct: Math.round(pct * 10) / 10 };
  }

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
          // pesoInternoKg gestito dall'import CSV, non modificabile qui
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
        {withCostCount > 0 && (
          <span className="ml-3">
            · Con costo asta: <b>{withCostCount}</b>
          </span>
        )}
      </div>

      {/* ── Selettore asta + parametri formula costo ─────────── */}
      <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
        <div className="text-sm font-semibold text-amber-900">
          🐟 Asta sorgente del catalogo
        </div>
        <p className="mt-1 text-xs text-amber-800">
          Scegli l'asta da cui proviene questo catalogo: i parametri qui sotto saranno usati per calcolare il <b>costo reale</b> di ogni lotto al momento dell'import.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={astaType}
            onChange={(e) => onAstaTypeChange(e.target.value as AstaType)}
            className="rounded border bg-white px-3 py-2 text-sm font-semibold"
          >
            <option value="civitavecchia">Civitavecchia</option>
            <option value="none">Nessuna formula (costo = imponibile grezzo)</option>
          </select>

          {astaType === "civitavecchia" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1">
                <span className="text-amber-900">€/cassa</span>
                <input
                  type="number"
                  step="0.01"
                  value={boxCost}
                  onChange={(e) => setBoxCost(e.target.value)}
                  className="w-20 rounded border px-2 py-1"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-amber-900">€/cassa trasp.</span>
                <input
                  type="number"
                  step="0.01"
                  value={transportBoxCost}
                  onChange={(e) => setTransportBoxCost(e.target.value)}
                  className="w-20 rounded border px-2 py-1"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-amber-900">% commissione</span>
                <input
                  type="number"
                  step="0.01"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="w-20 rounded border px-2 py-1"
                />
              </label>
            </div>
          )}
        </div>
        {astaType === "civitavecchia" && (
          <div className="mt-2 text-xs text-amber-800">
            Formula: <b>Costo = Imponibile + (casse × €cassa) + (casse × €trasp.) + (Imponibile × commiss.%)</b>
          </div>
        )}
      </div>

      {/* ── Import da listino aste ────────────────────────── */}
      <div className="mb-4 rounded-xl border bg-white p-3">
        <div className="text-sm font-semibold">Import da listino aste (PDF / XLSX acquisti)</div>
        <p className="mt-1 text-xs text-gray-500">
          Carica il PDF "Dettaglio lotti" o il file XLSX Acquisti Mercati.<br />
          I dati (specie, peso interno, N° coop, prezzo €/Kg, totale, casse, costo reale calcolato) vengono abbinati ai prodotti del catalogo in ordine di progressivo.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="file"
            accept=".pdf,.xlsx,.xls"
            onChange={(e) => { setAsteFile(e.target.files?.[0] ?? null); setAstePreview(null); }}
            className="w-full rounded border px-3 py-2"
          />
          <input
            type="number"
            placeholder="Prog. inizio (opz.)"
            value={asteProgressiveStart}
            onChange={(e) => setAsteProgressiveStart(e.target.value)}
            className="w-36 rounded border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => runImportAste("preview")}
              disabled={asteLoading || !asteFile}
              className="rounded border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Anteprima
            </button>
            <button
              type="button"
              onClick={() => runImportAste("apply")}
              disabled={asteLoading || !asteFile}
              className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Applica
            </button>
          </div>
        </div>

        {astePreview?.totals && (
          <div className="mt-2 text-sm text-gray-700">
            <div>
              Tipo file: <b>{astePreview.fileType ?? "—"}</b> — Lotti trovati: <b>{astePreview.totals.lotsFound ?? "—"}</b>
            </div>
            <div>
              Abbinati: <b>{astePreview.totals.matched ?? "—"}</b> — Non abbinati: <b>{astePreview.totals.unmatched ?? "—"}</b>
              {astePreview.totals.startAtProgressive != null && (
                <span> — Inizio da progressivo <b>{astePreview.totals.startAtProgressive}</b></span>
              )}
            </div>
            {astePreview.totals.withCost != null && (
              <div>
                Con costo calcolato: <b>{astePreview.totals.withCost}</b>
                {astePreview.totals.totalCost != null && (
                  <span> — Costo totale stimato: <b>{Number(astePreview.totals.totalCost).toFixed(2)} €</b></span>
                )}
              </div>
            )}
            {astePreview.sample?.matched?.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-gray-500">Mostra anteprima abbinamenti</summary>
                <div className="mt-1 max-h-48 overflow-y-auto rounded border bg-gray-50 p-2 text-xs font-mono">
                  {(astePreview.sample.matched as any[]).slice(0, 20).map((m: any, i: number) => (
                    <div key={i}>
                      Prog. {m.progressive_number} ← Peso {m.peso_interno_kg} kg
                      {m.specie ? `, ${m.specie}` : ""}
                      {m.numero_interno_cassa ? ` (coop ${m.numero_interno_cassa})` : ""}
                      {m.totale_eur != null ? ` · imp. ${Number(m.totale_eur).toFixed(2)}€` : ""}
                      {m.cost_eur != null ? ` → costo ${Number(m.cost_eur).toFixed(2)}€` : ""}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* ── Import pesi interni ──────────────────────────── */}
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
        {rows.map((r) => {
          const markup = computeMarkup(prices[r.id] ?? "", r.cost_eur);
          const markupColor =
            markup.pct == null
              ? "text-gray-400"
              : markup.pct < 0
              ? "text-red-700 bg-red-100"
              : markup.pct < 15
              ? "text-amber-800 bg-amber-100"
              : "text-green-800 bg-green-100";

          return (
            <div key={r.id} className="rounded-xl border bg-white p-3">
              <img
                src={`${base}/storage/v1/object/public/catalog-images/${r.image_path}`}
                className="h-40 w-full rounded-lg object-cover"
              />

              <div className="mt-2 text-sm text-gray-700">
                <div>
                  <b>Prog.</b> {r.progressive_number}
                  {r.box_number ? <span className="ml-1 text-gray-500">(Cassa {r.box_number})</span> : ""}
                  {r.numero_interno_cassa != null && (
                    <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                      N° coop: {r.numero_interno_cassa}
                    </span>
                  )}
                </div>
                {r.peso_interno_kg != null && (
                  <div className="text-gray-400">Peso int: {r.peso_interno_kg} kg</div>
                )}
                <div><b>Specie</b>: {r.specie || "—"}</div>
              </div>

              <input
                placeholder="Specie (es. Orata, Spigola...)"
                value={r.specie ?? ""}
                onChange={async (e) => {
                  const val = e.target.value;
                  setRows((prev) =>
                    prev.map((x) => (x.id === r.id ? { ...x, specie: val } : x))
                  );
                  await adminFetch("/api/admin/update-specie", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ productId: r.id, specie: val }),
                  });
                }}
                className="mt-2 w-full rounded border px-3 py-2"
              />

              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  placeholder="Prezzo €"
                  value={prices[r.id] ?? ""}
                  onChange={(e) => setPrices((p) => ({ ...p, [r.id]: e.target.value }))}
                  className="rounded border px-3 py-2"
                />
                <input
                  placeholder="Peso pub. kg"
                  value={weights[r.id] ?? ""}
                  onChange={(e) => setWeights((p) => ({ ...p, [r.id]: e.target.value }))}
                  className="rounded border px-3 py-2"
                />
              </div>

              {/* ── Costo + Ricarico % (sotto il prezzo di vendita) ─── */}
              {r.cost_eur != null ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs">
                  <div className="text-gray-600">
                    Costo: <b className="text-gray-900">{Number(r.cost_eur).toFixed(2)} €</b>
                    {r.auction_price_per_kg != null && (
                      <span className="ml-1 text-gray-400">
                        ({Number(r.auction_price_per_kg).toFixed(2)} €/Kg
                        {r.auction_boxes_count ? ` · ${r.auction_boxes_count} casse` : ""})
                      </span>
                    )}
                  </div>
                  {markup.pct != null ? (
                    <div className={`rounded px-2 py-0.5 font-bold ${markupColor}`}>
                      Ricarico: {markup.pct.toFixed(1)}%
                      {markup.value != null && (
                        <span className="ml-1 font-normal opacity-80">
                          ({markup.value >= 0 ? "+" : ""}
                          {markup.value.toFixed(2)} €)
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-400">Inserisci prezzo →</div>
                  )}
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-dashed border-gray-300 px-2 py-1.5 text-xs text-gray-400">
                  Costo non calcolato (importa file asta)
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
