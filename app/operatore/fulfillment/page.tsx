"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Product = {
  id: string;
  box_number: string | null;
  progressive_number: number | null;
  image_path: string | null;
  price_eur: number | null;
  weight_kg: number | null;
  peso_interno_kg: number | null;
  specie: string | null;
  numero_interno_cassa: string | null;
  catalogo: string | null;
};

type ClientOrder = {
  phone: string;
  name: string;
  company: string | null;
  orderId: string;
  createdAt: string;
  products: Product[];
};

const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const imgUrl = (path?: string | null) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${base}/storage/v1/object/public/catalog-images/${path}`;
};

function eur(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `€ ${Number(n).toFixed(2)}`;
}

const STORAGE_KEY = "op_fulfillment:prepared";

function loadFromStorage(): Record<string, Set<string>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const obj: Record<string, string[]> = JSON.parse(raw);
    const result: Record<string, Set<string>> = {};
    for (const [k, v] of Object.entries(obj)) result[k] = new Set(v);
    return result;
  } catch { return {}; }
}

function saveToStorage(prepared: Record<string, Set<string>>) {
  try {
    const obj: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(prepared)) obj[k] = Array.from(v);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function FulfillmentInner() {
  const searchParams = useSearchParams();
  const [fromDate, setFromDate] = useState<string>(searchParams.get("from") || todayStr());
  const [toDate, setToDate] = useState<string>(searchParams.get("to") || todayStr());

  const [clients, setClients] = useState<ClientOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [prepared, setPrepared] = useState<Record<string, Set<string>>>({});
  const [openClient, setOpenClient] = useState<string | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);

  useEffect(() => { setPrepared(loadFromStorage()); }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setErr("");
    setClients([]);
    try {
      const from = `${fromDate}T00:00:00Z`;
      const to = `${toDate}T23:59:59Z`;

      const { data: orders, error: oErr } = await supabaseBrowser()
        .from("orders")
        .select("id, customer_name, customer_phone, created_at")
        .gte("created_at", from)
        .lte("created_at", to)
        .order("customer_name", { ascending: true });
      if (oErr) throw oErr;
      if (!orders?.length) { setClients([]); return; }

      const orderIds = orders.map((o: any) => o.id);
      const { data: items, error: iErr } = await supabaseBrowser()
        .from("order_items")
        .select("order_id, products(id, box_number, progressive_number, image_path, price_eur, weight_kg, peso_interno_kg, specie, numero_interno_cassa, catalogs(title, online_title))")
        .in("order_id", orderIds);
      if (iErr) throw iErr;

      const phones = Array.from(new Set(orders.map((o: any) => String(o.customer_phone || "").trim())));
      const companyMap: Record<string, string | null> = {};
      try {
        const session = (await supabaseBrowser().auth.getSession()).data.session;
        const token = session?.access_token;
        if (token && phones.length) {
          const res = await fetch("/api/shared/companies", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ phones }),
          });
          if (res.ok) {
            const json = await res.json();
            Object.assign(companyMap, json.companies || {});
          }
        }
      } catch { /* ignora errori company */ }

      const itemsByOrder: Record<string, Product[]> = {};
      for (const row of (items || []) as any[]) {
        const p = row.products;
        if (!p) continue;
        const cat = Array.isArray(p.catalogs) ? p.catalogs[0] : p.catalogs;
        const catalogo = cat?.online_title || cat?.title || null;
        if (!itemsByOrder[row.order_id]) itemsByOrder[row.order_id] = [];
        itemsByOrder[row.order_id].push({
          id: p.id,
          box_number: p.box_number ?? null,
          progressive_number: p.progressive_number ?? null,
          image_path: p.image_path ?? null,
          price_eur: p.price_eur ?? null,
          weight_kg: p.weight_kg ?? null,
          peso_interno_kg: p.peso_interno_kg ?? null,
          specie: p.specie ?? null,
          numero_interno_cassa: p.numero_interno_cassa ?? null,
          catalogo,
        });
      }

      const clientMap: Record<string, ClientOrder> = {};
      for (const o of orders as any[]) {
        const phone = String(o.customer_phone || "").trim();
        const name = String(o.customer_name || "").trim() || "Cliente";
        const key = `${phone}|${name}`;
        if (!clientMap[key]) {
          clientMap[key] = { phone, name, company: companyMap[phone] ?? null, orderId: o.id, createdAt: o.created_at, products: [] };
        }
        clientMap[key].products.push(...(itemsByOrder[o.id] || []));
      }

      for (const c of Object.values(clientMap)) {
        const seen = new Set<string>();
        c.products = c.products.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
        c.products.sort((a, b) => (a.progressive_number ?? 999) - (b.progressive_number ?? 999));
      }

      setClients(Object.values(clientMap).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e: any) {
      setErr(e?.message ?? "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  function toggleProduct(orderId: string, productId: string) {
    setPrepared((prev) => {
      const set = new Set(prev[orderId] || []);
      if (set.has(productId)) set.delete(productId); else set.add(productId);
      const next = { ...prev, [orderId]: set };
      saveToStorage(next);
      return next;
    });
  }

  function resetAll() {
    setPrepared({});
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function isPrepared(orderId: string, productId: string) { return prepared[orderId]?.has(productId) ?? false; }
  function preparedCount(c: ClientOrder) { return prepared[c.orderId]?.size ?? 0; }
  function allPrepared(c: ClientOrder) { return c.products.length > 0 && preparedCount(c) >= c.products.length; }

  function buildClientHtml(c: ClientOrder, onlyPrepared = true) {
    const products = onlyPrepared ? c.products.filter((p) => isPrepared(c.orderId, p.id)) : c.products;
    if (!products.length) return "";
    const now = new Date().toLocaleString("it-IT");
    const rows = products.map((p) => {
      const coop = p.numero_interno_cassa
        ? `<span style="background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px;">N° coop: ${p.numero_interno_cassa}</span>`
        : "";
      const specie = p.specie ? `<div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.03em;margin-top:2px;">${p.specie}</div>` : "";
      const weights: string[] = [];
      if (p.peso_interno_kg != null) weights.push(`Peso int. ${Number(p.peso_interno_kg).toFixed(2)} kg`);
      if (p.weight_kg != null) weights.push(`Peso "H" ${Number(p.weight_kg).toFixed(2)} kg`);
      const weightsHtml = weights.length ? `<div style="font-size:11px;color:#666;margin-top:2px;">${weights.join(" | ")}</div>` : "";
      const photo = p.image_path
        ? `<img src="${imgUrl(p.image_path)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;flex-shrink:0;" />`
        : `<div style="width:72px;height:72px;background:#f3f4f6;border-radius:8px;flex-shrink:0;"></div>`;
      return `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0;page-break-inside:avoid;">
          <div style="width:20px;height:20px;border:2px solid #333;border-radius:3px;flex-shrink:0;margin-top:4px;background:#000;"></div>
          ${photo}
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;">Cassa ${p.box_number ?? "?"}${coop}</div>
            ${specie}${weightsHtml}
          </div>
          <div style="font-size:14px;font-weight:700;white-space:nowrap;flex-shrink:0;">${eur(p.price_eur)}</div>
        </div>`;
    }).join("");
    return `
      <div style="margin-bottom:40px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px;">
          <div style="font-size:18px;font-weight:800;">${c.name}${c.company ? ` (${c.company})` : ""}</div>
          <div style="font-size:11px;color:#666;">${c.phone}</div>
        </div>
        ${rows}
        <div style="margin-top:16px;font-size:11px;color:#aaa;text-align:center;">Spunte: usa la casella a sinistra per segnare la cassa preparata.</div>
      </div>`;
  }

  function printAll() {
    const withPrepared = clients.filter((c) => (prepared[c.orderId]?.size ?? 0) > 0);
    if (!withPrepared.length) { alert("Nessun prodotto preparato da stampare."); return; }
    const now = new Date().toLocaleString("it-IT");
    const blocks = withPrepared.map((c, i) => {
      const isLast = i === withPrepared.length - 1;
      return `<div style="${isLast ? "" : "page-break-after:always;"}">${buildClientHtml(c, true)}</div>`;
    }).join("");
    setPrintHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#111;padding:24px;}
      @media print{body{padding:0;}.no-print{display:none!important;}}
    </style></head><body>
      <div class="no-print" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #eee;">
        <button onclick="window.close()" style="padding:8px 16px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;">✕ Chiudi</button>
        <div style="text-align:center;"><div style="font-size:16px;font-weight:700;">Evasione ordini</div><div style="font-size:12px;color:#888;">${now}</div></div>
        <button onclick="window.print()" style="padding:8px 20px;background:#000;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">🖨️ Stampa</button>
      </div>
      ${blocks}
    </body></html>`);
  }

  function printClient(c: ClientOrder) {
    const now = new Date().toLocaleString("it-IT");
    const block = buildClientHtml(c, true);
    if (!block) { alert("Nessun prodotto preparato per questo cliente."); return; }
    setPrintHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#111;padding:24px;}
      @media print{body{padding:0;}.no-print{display:none!important;}}
    </style></head><body>
      <div class="no-print" style="display:flex;justify-content:flex-end;gap:12px;align-items:center;margin-bottom:16px;">
        <span style="color:#666;font-size:12px;">${now}</span>
        <button onclick="window.print()" style="padding:8px 20px;background:#000;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">🖨️ Stampa</button>
      </div>
      ${block}
    </body></html>`);
  }

  return (
    <div className="mx-auto max-w-2xl p-4">

      {/* OVERLAY STAMPA */}
      {printHtml && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b px-4 py-3 print:hidden">
            <button className="rounded-lg border px-4 py-2 text-sm font-semibold" onClick={() => setPrintHtml(null)}>✕ Chiudi</button>
            <button
              className="rounded-lg bg-black px-5 py-2 text-sm font-bold text-white"
              onClick={() => { const f = document.getElementById("op-print-iframe") as HTMLIFrameElement; f?.contentWindow?.print(); }}
            >🖨 Stampa</button>
          </div>
          <iframe id="op-print-iframe" srcDoc={printHtml} className="flex-1 w-full border-0" title="Stampa evasione" />
        </div>
      )}

      <h1 className="text-2xl font-bold mb-4">Evasione ordini</h1>

      {/* Filtro date */}
      <div className="mb-4 rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Da</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">A</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
          </div>
          <button className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={loading} onClick={loadOrders}>
            Carica ordini
          </button>
          <div className="text-xs text-gray-500 self-end pb-2">
            {loading ? "Caricamento…" : `${clients.length} clienti`}
          </div>
        </div>
      </div>

      {/* Azioni globali */}
      <div className="mb-4 flex justify-end gap-2">
        <button
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
          disabled={clients.every((c) => (prepared[c.orderId]?.size ?? 0) === 0)}
          onClick={() => { if (confirm("Azzera tutti i prodotti preparati?")) resetAll(); }}
        >Azzera tutto</button>
        <button
          className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          disabled={clients.every((c) => (prepared[c.orderId]?.size ?? 0) === 0)}
          onClick={printAll}
        >Stampa tutto</button>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-4">{err}</div>}

      {!loading && clients.length === 0 && (
        <div className="rounded-xl border bg-gray-50 p-8 text-center text-gray-500">Nessun ordine nel periodo selezionato.</div>
      )}

      <div className="space-y-3">
        {clients.map((c) => {
          const done = preparedCount(c);
          const total = c.products.length;
          const complete = allPrepared(c);
          const clientKey = `${c.phone}|${c.name}`;
          const isOpen = openClient === clientKey;

          return (
            <div key={clientKey} className={`rounded-2xl border bg-white shadow-sm overflow-hidden transition-all ${complete ? "border-green-400" : ""}`}>
              <button className="w-full px-4 py-3 flex items-center gap-3 text-left" onClick={() => setOpenClient(isOpen ? null : clientKey)}>
                <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold border-2 ${complete ? "bg-green-500 border-green-500 text-white" : "border-gray-300 text-gray-600"}`}>
                  {complete ? "✓" : `${done}/${total}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}{c.company ? ` · ${c.company}` : ""}</div>
                  <div className="text-xs text-gray-500">{total} {total === 1 ? "cassa" : "casse"}</div>
                </div>
                <div className="w-24 flex-shrink-0">
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${complete ? "bg-green-500" : "bg-blue-500"}`} style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%" }} />
                  </div>
                </div>
                <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="border-t">
                  <div className="divide-y">
                    {c.products.map((p) => {
                      const ok = isPrepared(c.orderId, p.id);
                      return (
                        <button
                          key={p.id}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${ok ? "bg-green-50" : "hover:bg-gray-50"}`}
                          onClick={() => toggleProduct(c.orderId, p.id)}
                        >
                          <img src={imgUrl(p.image_path)} className="h-16 w-16 flex-shrink-0 rounded-xl border object-cover bg-gray-100" alt="" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm flex flex-wrap items-center gap-1.5">
                              <span>Cassa {p.box_number ?? "?"}</span>
                              {p.numero_interno_cassa && (
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">N° coop: {p.numero_interno_cassa}</span>
                              )}
                            </div>
                            {p.specie && <div className="text-sm font-bold uppercase tracking-wide text-gray-800 mt-0.5">{p.specie}</div>}
                            <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
                              {p.peso_interno_kg != null && <span>int. {Number(p.peso_interno_kg).toFixed(2)} kg</span>}
                              {p.weight_kg != null && <span>pub. {Number(p.weight_kg).toFixed(2)} kg</span>}
                              {p.catalogo && <span className="italic">[{p.catalogo}]</span>}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="text-sm font-semibold">{eur(p.price_eur)}</div>
                            <div className={`mt-1 text-lg ${ok ? "text-green-500" : "text-gray-200"}`}>{ok ? "✔" : "○"}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-4 border-t bg-gray-50 flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-600">
                      {done}/{total} preparate
                      {!complete && done > 0 && <span className="ml-2 text-orange-500">· incompleto</span>}
                    </div>
                    <div className="flex gap-2">
                      {!complete && done > 0 && (
                        <button className="rounded-xl border border-orange-300 px-4 py-2.5 text-sm font-semibold text-orange-600 bg-orange-50" onClick={() => printClient(c)}>
                          Stampa incompleto
                        </button>
                      )}
                      <button
                        className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all ${complete ? "bg-black" : "bg-gray-300 cursor-not-allowed"}`}
                        disabled={!complete}
                        onClick={() => printClient(c)}
                      >
                        Stampa riepilogo
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OperatoreFulfillmentPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-gray-500">Caricamento…</div>}>
      <FulfillmentInner />
    </Suspense>
  );
}
