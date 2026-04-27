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

type AstaType =
  | "civitavecchia"
  | "agde"
  | "sete"
  | "tarragona"
  | "roses"
  | "none";

// Default identici a ANALISI VENDITA/public/aste.html (e civitavecchia.html)
const ASTA_DEFAULTS: Record<AstaType, Record<string, string>> = {
  civitavecchia: { boxCost: "1", transportBoxCost: "2", commissionRate: "2" },
  agde: {
    "ag-cassa": "1.00",
    "ag-cop": "0.70",
    "ag-pal": "5.00",
    "ag-rev": "2.00",
    "ag-tc": "2.00",
    "ag-td": "2.50",
    "ag-mul": "0.0141",
    "ag-ghi": "0.10",
    "ag-car": "0.0714",
    "ag-amm": "4.50",
    surcarb: "31",
  },
  sete: {
    "se-rec": "1.54",
    "se-pal": "3.60",
    "se-gest": "1.50",
    "se-td": "2.00",
    "se-rev": "2.00",
    "se-frais": "1.81",
    surcarb: "31",
  },
  tarragona: {
    "ta-cgr": "0.50",
    "ta-cpe": "0.50",
    "ta-man": "1.90",
    "ta-pal": "6.00",
    "ta-etq": "0.015",
    "ta-rec": "0.16",
    "ta-ret": "4.00",
    surcarb: "31",
  },
  roses: {
    "ro-imp": "2.00",
    "ro-car": "2.10",
    "ro-cai": "6.50",
    surcarb: "31",
  },
  none: {},
};

const ASTA_LABELS: Record<AstaType, string> = {
  civitavecchia: "Civitavecchia (IT)",
  agde: "Grau d'Agde (FR)",
  sete: "Sète (FR)",
  tarragona: "Tarragona (ES)",
  roses: "Roses (ES)",
  none: "Nessuna formula (costo = imponibile grezzo)",
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

  // Tipo asta + parametri formula costo (generico key→value)
  const [astaType, setAstaType] = useState<AstaType>("civitavecchia");
  const [astaParams, setAstaParams] = useState<Record<string, string>>(
    { ...ASTA_DEFAULTS.civitavecchia }
  );

  function onAstaTypeChange(next: AstaType) {
    setAstaType(next);
    setAstaParams({ ...ASTA_DEFAULTS[next] });
  }

  function setParam(key: string, value: string) {
    setAstaParams((p) => ({ ...p, [key]: value }));
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
      // Inviamo tutti i parametri dell'asta selezionata (chiavi specifiche per tipo)
      for (const [k, v] of Object.entries(astaParams)) {
        fd.append(k, String(v).replace(",", "."));
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
      const validTypes: AstaType[] = [
        "civitavecchia", "agde", "sete", "tarragona", "roses",
      ];
      if (t && (validTypes as string[]).includes(t)) {
        const tt = t as AstaType;
        setAstaType(tt);
        const p = ((data as any).asta_params || {}) as Record<string, any>;
        const merged: Record<string, string> = { ...ASTA_DEFAULTS[tt] };
        for (const [k, v] of Object.entries(p)) {
          if (v != null && v !== "") merged[k] = String(v);
        }
        setAstaParams(merged);
      }
    })();
  }, [catalogId]);

  const notPricedCount = useMemo(
    () => rows.filter((r) => (prices[r.id] ?? "").trim() === "").length,
    [rows, prices]
  );

  const withCostCount = useMemo(() => rows.filter((r) => r.cost_eur != null).length, [rows]);

  /**
   * Calcola tutti i numeri utili per la card prodotto.
   *
   * IMPORTANTE: nel portale il "Prezzo €" inserito è **sempre €/Kg**,
   * non un totale per cassa. Il totale che paga il cliente per quel
   * prodotto = prezzo €/Kg × peso pubblicato (kg).
   *
   * - Costo €/Kg = cost_eur (totale lotto) / peso pubblicato
   *   (così è direttamente confrontabile col prezzo di vendita €/Kg)
   *   Fallback su peso interno se peso pubblicato non c'è.
   * - Prezzo di vendita €/Kg = quello inserito.
   * - Ricavo totale = prezzo €/Kg × peso pub
   * - Ricarico % = (ricavo totale - cost_eur) / cost_eur × 100
   */
  function computeRow(
    priceStr: string,
    weightStr: string,
    costTot: number | null,
    pesoInternoKg: number | null
  ) {
    const wv = (weightStr ?? "").trim().replace(",", ".");
    const weightPub = wv === "" ? null : Number(wv);
    const validWeightPub =
      weightPub != null && Number.isFinite(weightPub) && weightPub > 0;
    const refKg = validWeightPub
      ? weightPub!
      : pesoInternoKg && pesoInternoKg > 0
      ? pesoInternoKg
      : null;

    const costPerKg =
      costTot != null && costTot > 0 && refKg != null
        ? Math.round((costTot / refKg) * 100) / 100
        : null;

    const pv = (priceStr ?? "").trim().replace(",", ".");
    const price = pv === "" ? null : Number(pv);
    const validPrice = price != null && Number.isFinite(price);

    // pricePerKg = quello inserito (è già €/Kg)
    const pricePerKg = validPrice ? Math.round(price! * 100) / 100 : null;

    // Ricavo totale per il prodotto = €/Kg × peso pubblicato (o peso interno fallback)
    const revenueTot =
      validPrice && refKg != null
        ? Math.round(price! * refKg * 100) / 100
        : null;

    let marginValue: number | null = null;
    let marginPct: number | null = null;
    if (revenueTot != null && costTot != null && costTot > 0) {
      marginValue = Math.round((revenueTot - costTot) * 100) / 100;
      marginPct = Math.round(((revenueTot - costTot) / costTot) * 1000) / 10;
    }

    return { costPerKg, pricePerKg, revenueTot, marginValue, marginPct };
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
          Scegli l'asta da cui proviene questo catalogo: i parametri saranno usati per calcolare il <b>costo reale</b> di ogni lotto al momento dell'import. I default sono già impostati come in ANALISI VENDITA.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={astaType}
            onChange={(e) => onAstaTypeChange(e.target.value as AstaType)}
            className="rounded border bg-white px-3 py-2 text-sm font-semibold"
          >
            {(Object.keys(ASTA_LABELS) as AstaType[]).map((k) => (
              <option key={k} value={k}>
                {ASTA_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        {/* Pannello parametri dinamico — varia per asta */}
        <AstaParamsPanel astaType={astaType} astaParams={astaParams} setParam={setParam} />
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
          const calc = computeRow(
            prices[r.id] ?? "",
            weights[r.id] ?? "",
            r.cost_eur,
            r.peso_interno_kg
          );
          const markupColor =
            calc.marginPct == null
              ? "text-gray-400"
              : calc.marginPct < 0
              ? "text-red-700 bg-red-100"
              : calc.marginPct < 15
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
                  placeholder="Prezzo €/Kg"
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

              {/* ── Costo €/Kg + Ricarico % (sotto il prezzo di vendita) ─── */}
              {r.cost_eur != null ? (
                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs">
                  {/* Riga 1: COSTO — primario in €/Kg, secondario totali */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-gray-700">
                      Costo:{" "}
                      <b className="text-gray-900">
                        {calc.costPerKg != null
                          ? `${calc.costPerKg.toFixed(2)} €/Kg`
                          : `${Number(r.cost_eur).toFixed(2)} €`}
                      </b>
                      <span className="ml-1 text-gray-400">
                        ({Number(r.cost_eur).toFixed(2)} € tot
                        {r.auction_boxes_count ? ` · ${r.auction_boxes_count} casse` : ""}
                        {r.auction_price_per_kg != null
                          ? ` · asta ${Number(r.auction_price_per_kg).toFixed(2)} €/Kg`
                          : ""}
                        )
                      </span>
                    </div>
                  </div>

                  {/* Riga 2: VENDITA €/Kg + totale ricavo + ricarico % colorato */}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-gray-700">
                      Vendita:{" "}
                      <b className="text-gray-900">
                        {calc.pricePerKg != null
                          ? `${calc.pricePerKg.toFixed(2)} €/Kg`
                          : "—"}
                      </b>
                      {calc.revenueTot != null && (
                        <span className="ml-1 text-gray-400">
                          ({calc.revenueTot.toFixed(2)} € tot)
                        </span>
                      )}
                    </div>
                    {calc.marginPct != null ? (
                      <div className={`rounded px-2 py-0.5 font-bold ${markupColor}`}>
                        Ricarico: {calc.marginPct.toFixed(1)}%
                        {calc.marginValue != null && (
                          <span className="ml-1 font-normal opacity-80">
                            ({calc.marginValue >= 0 ? "+" : ""}
                            {calc.marginValue.toFixed(2)} €)
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-gray-400">Inserisci prezzo →</div>
                    )}
                  </div>
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

// ─────────────────────────────────────────────────────────────────────
// Pannello parametri asta (varia per tipo)
// I default sono identici a ANALISI VENDITA/public/aste.html
// ─────────────────────────────────────────────────────────────────────

type ParamSpec = { key: string; label: string; step?: string; suffix?: string };

const PARAM_SPECS: Record<AstaType, ParamSpec[]> = {
  civitavecchia: [
    { key: "boxCost", label: "€/cassa", step: "0.01" },
    { key: "transportBoxCost", label: "€/cassa trasp.", step: "0.01" },
    { key: "commissionRate", label: "% commissione", step: "0.01", suffix: "%" },
  ],
  agde: [
    { key: "ag-cassa", label: "Cassa Poly Vente €/cassa", step: "0.01" },
    { key: "ag-cop", label: "Coperchio €/cop. (6 per pallet)", step: "0.01" },
    { key: "ag-pal", label: "Pallet €/pal. (1 ogni 40 casse)", step: "0.10" },
    { key: "ag-rev", label: "Redevance équipement", step: "0.01", suffix: "%" },
    { key: "ag-tc", label: "Taxe de criée", step: "0.01", suffix: "%" },
    { key: "ag-td", label: "Taxe vente à distance", step: "0.01", suffix: "%" },
    { key: "ag-mul", label: "Muletto/Chariot €/kg", step: "0.0001" },
    { key: "ag-ghi", label: "Ghiacciatura €/kg (no cefalopodi)", step: "0.01" },
    { key: "ag-car", label: "Carta Bac €/cassa", step: "0.0001" },
    { key: "ag-amm", label: "Spese amm. €/spedizione", step: "0.10" },
    { key: "surcarb", label: "OLANO surcharge", step: "0.5", suffix: "%" },
  ],
  sete: [
    { key: "se-rec", label: "Reconditionnement €/bac", step: "0.01" },
    { key: "se-pal", label: "Palette 80×120 €/pallet", step: "0.10" },
    { key: "se-gest", label: "Gestion", step: "0.01", suffix: "%" },
    { key: "se-td", label: "Taxe Acheteur Distance", step: "0.01", suffix: "%" },
    { key: "se-rev", label: "Redev. Équipement", step: "0.01", suffix: "%" },
    { key: "se-frais", label: "Frais divers €/giorno", step: "0.01" },
    { key: "surcarb", label: "OLANO surcharge", step: "0.5", suffix: "%" },
  ],
  tarragona: [
    { key: "ta-cgr", label: "C.Plastic Gran €/cassa grande", step: "0.01" },
    { key: "ta-cpe", label: "C.Plast.Petita €/cassa piccola", step: "0.01" },
    { key: "ta-man", label: "Manipolació Porex €/cassa", step: "0.01" },
    { key: "ta-pal", label: "Palet de Fusta €/pallet", step: "0.50" },
    { key: "ta-etq", label: "Etiquetes €/lotto", step: "0.001" },
    { key: "ta-rec", label: "Recollida €/cassa", step: "0.01" },
    { key: "ta-ret", label: "Retencio Confraria", step: "0.01", suffix: "%" },
    { key: "surcarb", label: "OLANO surcharge", step: "0.5", suffix: "%" },
  ],
  roses: [
    { key: "ro-imp", label: "Impost Ports", step: "0.01", suffix: "%" },
    { key: "ro-car", label: "Càrrec Confraria", step: "0.01", suffix: "%" },
    { key: "ro-cai", label: "Caixes Noves €/cassa (1/lotto)", step: "0.10" },
    { key: "surcarb", label: "OLANO surcharge", step: "0.5", suffix: "%" },
  ],
  none: [],
};

const FORMULA_HINT: Record<AstaType, string> = {
  civitavecchia:
    "Costo per lotto = Imponibile + (casse × €cassa) + (casse × €trasp.) + (Imponibile × commiss.%)",
  agde:
    "Aggregato sul file: criée (casse + cop + pallet + % rev/tc/td su valore + muletto×kg + ghiacciatura×kg pesce + carta bac + amm) + OLANO trasp. FR (a scaglioni) → ripartito sui lotti per peso.",
  sete:
    "Aggregato sul file: criée (recond + palette + % gest/td/rev su valore + frais) + OLANO trasp. FR → ripartito sui lotti per peso.",
  tarragona:
    "Aggregato sul file: criée (casse gran/petita 80/20 + porex + palet + etq + recollida + retencio %) + OLANO trasp. BCN → ripartito sui lotti per peso.",
  roses:
    "Aggregato sul file: criée (% impost + % càrrec + caixes noves×lotti) + OLANO trasp. BCN → ripartito sui lotti per peso.",
  none: "Costo = Imponibile (Totale €) grezzo, senza maggiorazioni.",
};

function AstaParamsPanel(props: {
  astaType: AstaType;
  astaParams: Record<string, string>;
  setParam: (k: string, v: string) => void;
}) {
  const specs = PARAM_SPECS[props.astaType] || [];
  if (specs.length === 0) {
    return (
      <div className="mt-2 text-xs text-amber-800">{FORMULA_HINT[props.astaType]}</div>
    );
  }
  return (
    <>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {specs.map((s) => (
          <label key={s.key} className="flex items-center justify-between gap-2 rounded border bg-white px-2 py-1 text-xs">
            <span className="text-amber-900">{s.label}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                step={s.step ?? "0.01"}
                value={props.astaParams[s.key] ?? ""}
                onChange={(e) => props.setParam(s.key, e.target.value)}
                className="w-20 rounded border px-2 py-1 text-right"
              />
              {s.suffix && <span className="text-amber-900">{s.suffix}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-2 text-xs text-amber-800">
        <b>Formula:</b> {FORMULA_HINT[props.astaType]}
      </div>
    </>
  );
}
