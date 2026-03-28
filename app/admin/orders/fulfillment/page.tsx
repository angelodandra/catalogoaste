"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { adminFetch } from "@/lib/adminFetch";

type Product = {
  id: string;
  box_number: string | null;
  progressive_number: number | null;
  image_path: string | null;
  price_eur: number | null;
  weight_kg: number | null;
  peso_interno_kg: number | null;
  specie: string | null;
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

const STORAGE_KEY = "fulfillment:prepared";

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

export default function FulfillmentPage() {
  const [clients, setClients] = useState<ClientOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // set dei productId preparati per ordine: { orderId: Set<productId> }
  const [prepared, setPrepared] = useState<Record<string, Set<string>>>({});
  // quale cliente ha il pannello aperto
  const [openClient, setOpenClient] = useState<string | null>(null);
  // contenuto HTML da stampare (overlay a schermo intero, compatibile Safari iOS)
  const [printHtml, setPrintHtml] = useState<string | null>(null);

  // Carica stato preparati da localStorage al mount
  useEffect(() => {
    setPrepared(loadFromStorage());
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const { supabaseBrowser: sb } = await import("@/lib/supabaseBrowser");
        const { data: sessionData } = await sb().auth.getSession();
        const token = sessionData?.session?.access_token;

        // ordini di oggi (ultimi 2 giorni per sicurezza)
        const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

        const { data: orders, error: oErr } = await supabaseBrowser()
          .from("orders")
          .select("id, customer_name, customer_phone, created_at")
          .gte("created_at", since)
          .order("customer_name", { ascending: true });
        if (oErr) throw oErr;
        if (!orders?.length) { setClients([]); return; }

        const orderIds = orders.map((o: any) => o.id);
        const { data: items, error: iErr } = await supabaseBrowser()
          .from("order_items")
          .select("order_id, products(id, box_number, progressive_number, image_path, price_eur, weight_kg, peso_interno_kg, specie, catalogs(title, online_title))")
          .in("order_id", orderIds);
        if (iErr) throw iErr;

        const phones = Array.from(new Set(orders.map((o: any) => String(o.customer_phone || "").trim())));
        const { data: custs } = await supabaseBrowser()
          .from("customers")
          .select("phone, company")
          .in("phone", phones);
        const companyMap: Record<string, string | null> = {};
        for (const c of (custs || []) as any[]) companyMap[c.phone] = c.company ?? null;

        // raggruppa items per ordine
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
            catalogo,
          });
        }

        // raggruppa per cliente — chiave phone|name per separare ordini
        // dello stesso venditore fatti per clienti diversi
        const clientMap: Record<string, ClientOrder> = {};
        for (const o of orders as any[]) {
          const phone = String(o.customer_phone || "").trim();
          const name = String(o.customer_name || "").trim() || "Cliente";
          const groupKey = `${phone}|${name}`;
          if (!clientMap[groupKey]) {
            clientMap[groupKey] = {
              phone,
              name,
              company: companyMap[phone] ?? null,
              orderId: o.id,
              createdAt: o.created_at,
              products: [],
            };
          }
          clientMap[groupKey].products.push(...(itemsByOrder[o.id] || []));
        }

        // rimuovi duplicati di prodotto (stesso id)
        for (const c of Object.values(clientMap)) {
          const seen = new Set<string>();
          c.products = c.products.filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
          // ordina per progressivo
          c.products.sort((a, b) => (a.progressive_number ?? 999) - (b.progressive_number ?? 999));
        }

        setClients(Object.values(clientMap).sort((a, b) => a.name.localeCompare(b.name)));
      } catch (e: any) {
        setErr(e?.message ?? "Errore caricamento");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleProduct(orderId: string, productId: string) {
    setPrepared((prev) => {
      const set = new Set(prev[orderId] || []);
      if (set.has(productId)) set.delete(productId);
      else set.add(productId);
      const next = { ...prev, [orderId]: set };
      saveToStorage(next);
      return next;
    });
  }

  function resetAll() {
    setPrepared({});
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function isPrepared(orderId: string, productId: string) {
    return prepared[orderId]?.has(productId) ?? false;
  }

  function preparedCount(c: ClientOrder) {
    return (prepared[c.orderId]?.size ?? 0);
  }

  function allPrepared(c: ClientOrder) {
    return c.products.length > 0 && preparedCount(c) >= c.products.length;
  }

  // Mostra HTML in overlay a schermo intero — compatibile Safari iOS (no popup/new tab)
  function openHtmlInNewTab(html: string) {
    setPrintHtml(html);
  }

  function buildClientBlock(c: ClientOrder) {
    const printProducts = c.products.filter((p) => isPrepared(c.orderId, p.id));
    if (!printProducts.length) return "";
    const rows = printProducts.map((p) => {
      const weight = p.weight_kg != null ? `pub. ${Number(p.weight_kg).toFixed(2)} kg` : "";
      const internal = p.peso_interno_kg != null ? `int. ${Number(p.peso_interno_kg).toFixed(2)} kg` : "";
      const weights = [weight, internal].filter(Boolean).join(" · ");
      return `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 6px;">
            <span style="display:inline-block;width:18px;height:18px;border:2px solid #000;border-radius:3px;background:#000;vertical-align:middle;margin-right:8px;"></span>
            ${p.specie ? `<span style="font-size:17px;font-weight:800;">${p.specie}</span><br>` : ""}
            <span style="font-size:13px;color:#444;">Cassa ${p.box_number ?? "?"}${p.progressive_number != null ? ` · Prog ${p.progressive_number}` : ""}</span>
            ${p.catalogo ? `<span style="color:#888;font-size:11px;font-style:italic;"> [${p.catalogo}]</span>` : ""}
            ${weights ? `<br><span style="color:#666;font-size:11px;">${weights}</span>` : ""}
          </td>
          <td style="padding:10px 6px;text-align:right;font-weight:600;white-space:nowrap;vertical-align:top;">${eur(p.price_eur)}</td>
        </tr>`;
    }).join("");
    const total = printProducts.reduce((acc, p) => acc + (Number(p.price_eur) || 0), 0);
    return `
      <div style="margin-bottom:32px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:6px;">
          <div style="font-size:18px;font-weight:700;">${c.name}${c.company ? ` (${c.company})` : ""}</div>
          <div style="color:#666;font-size:12px;">${c.phone}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody>
          <tfoot><tr><td colspan="2" style="text-align:right;padding:10px 6px;font-size:15px;font-weight:700;border-top:2px solid #000;">
            Totale: € ${total.toFixed(2)}
          </td></tr></tfoot>
        </table>
      </div>`;
  }

  function printAll() {
    const now = new Date().toLocaleString("it-IT");
    const clientsWithPrepared = clients.filter((c) => (prepared[c.orderId]?.size ?? 0) > 0);
    if (!clientsWithPrepared.length) return;
    const blocks = clientsWithPrepared.map(buildClientBlock).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Evasione ordini</title>
      <style>body{font-family:sans-serif;margin:24px;font-size:14px;}@media print{button{display:none!important;}}</style>
    </head><body>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
        <div style="font-size:20px;font-weight:800;">Evasione ordini</div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="color:#666;font-size:12px;">Stampato il ${now}</span>
          <button onclick="window.print()" style="padding:8px 16px;background:#000;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Stampa</button>
        </div>
      </div>
      ${blocks}
    </body></html>`;
    openHtmlInNewTab(html);
  }

  function printClient(c: ClientOrder) {
    const now = new Date().toLocaleString("it-IT");
    const block = buildClientBlock(c);
    if (!block) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Evasione ${c.name}</title>
      <style>body{font-family:sans-serif;margin:24px;font-size:14px;}table{width:100%;border-collapse:collapse;}@media print{button{display:none!important;}}</style>
    </head><body>
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-bottom:4px;">
        <span style="color:#666;font-size:12px;">Stampato il ${now}</span>
        <button onclick="window.print()" style="padding:8px 16px;background:#000;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Stampa</button>
      </div>
      ${block}
    </body></html>`;
    openHtmlInNewTab(html);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-500">Caricamento ordini…</div>
  );
  if (err) return (
    <div className="p-6 text-red-600">{err}</div>
  );

  return (
    <div className="mx-auto max-w-2xl p-4">

      {/* OVERLAY STAMPA — schermo intero, compatibile Safari iOS */}
      {printHtml && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          {/* Barra superiore */}
          <div className="flex items-center justify-between border-b px-4 py-3 print:hidden">
            <button
              className="rounded-lg border px-4 py-2 text-sm font-semibold"
              onClick={() => setPrintHtml(null)}
            >
              ✕ Chiudi
            </button>
            <button
              className="rounded-lg bg-black px-5 py-2 text-sm font-bold text-white"
              onClick={() => {
                const iframe = document.getElementById("print-iframe") as HTMLIFrameElement;
                iframe?.contentWindow?.print();
              }}
            >
              🖨 Stampa
            </button>
          </div>
          {/* Contenuto in iframe isolato */}
          <iframe
            id="print-iframe"
            srcDoc={printHtml}
            className="flex-1 w-full border-0"
            title="Stampa preparazione"
          />
        </div>
      )}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/orders" className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">← Ordini</Link>
          <div>
            <h1 className="text-xl font-bold">Evasione ordini</h1>
            <div className="text-xs text-gray-500">{clients.length} clienti · ultimi 2 giorni</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
            disabled={clients.every((c) => (prepared[c.orderId]?.size ?? 0) === 0)}
            onClick={() => { if (confirm("Azzera tutti i prodotti preparati?")) resetAll(); }}
          >
            Azzera evasione
          </button>
          <button
            className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            disabled={clients.every((c) => (prepared[c.orderId]?.size ?? 0) === 0)}
            onClick={printAll}
          >
            Stampa tutto
          </button>
        </div>
      </div>

      {clients.length === 0 && (
        <div className="rounded-xl border bg-gray-50 p-8 text-center text-gray-500">
          Nessun ordine recente.
        </div>
      )}

      <div className="space-y-3">
        {clients.map((c) => {
          const done = preparedCount(c);
          const total = c.products.length;
          const complete = allPrepared(c);
          const clientKey = `${c.phone}|${c.name}`;
          const isOpen = openClient === clientKey;

          return (
            <div key={`${c.phone}|${c.name}`} className={`rounded-2xl border bg-white shadow-sm overflow-hidden transition-all ${complete ? "border-green-400" : ""}`}>
              {/* intestazione cliente — tap per aprire/chiudere */}
              <button
                className="w-full px-4 py-3 flex items-center gap-3 text-left"
                onClick={() => setOpenClient(isOpen ? null : clientKey)}
              >
                {/* progress circle */}
                <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold border-2
                  ${complete ? "bg-green-500 border-green-500 text-white" : "border-gray-300 text-gray-600"}`}>
                  {complete ? "✓" : `${done}/${total}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}{c.company ? ` · ${c.company}` : ""}</div>
                  <div className="text-xs text-gray-500">{total} {total === 1 ? "cassa" : "casse"}</div>
                </div>
                {/* progress bar */}
                <div className="w-24 flex-shrink-0">
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${complete ? "bg-green-500" : "bg-blue-500"}`}
                      style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
                <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
              </button>

              {/* lista prodotti */}
              {isOpen && (
                <div className="border-t">
                  <div className="divide-y">
                    {c.products.map((p) => {
                      const ok = isPrepared(c.orderId, p.id);
                      return (
                        <button
                          key={p.id}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                            ${ok ? "bg-green-50" : "hover:bg-gray-50"}`}
                          onClick={() => toggleProduct(c.orderId, p.id)}
                        >
                          {/* foto */}
                          <img
                            src={imgUrl(p.image_path)}
                            className="h-14 w-14 flex-shrink-0 rounded-xl border object-cover bg-gray-100"
                            alt=""
                          />
                          {/* dati */}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm">
                              Cassa {p.box_number ?? "?"}{p.progressive_number != null ? ` · Prog ${p.progressive_number}` : ""}
                            </div>
                            {p.specie && <div className="text-sm text-gray-700">{p.specie}</div>}
                            <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
                              {p.weight_kg != null && <span>pub. {Number(p.weight_kg).toFixed(2)} kg</span>}
                              {p.peso_interno_kg != null && <span>int. {Number(p.peso_interno_kg).toFixed(2)} kg</span>}
                              {p.catalogo && <span className="italic">[{p.catalogo}]</span>}
                            </div>
                          </div>
                          {/* prezzo + segno */}
                          <div className="flex-shrink-0 text-right">
                            <div className="text-sm font-semibold">{eur(p.price_eur)}</div>
                            <div className={`mt-1 text-lg ${ok ? "text-green-500" : "text-gray-200"}`}>
                              {ok ? "✔" : "○"}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* footer con bottoni stampa */}
                  <div className="p-4 border-t bg-gray-50 flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-600">
                      {done}/{total} preparate
                      {!complete && <span className="ml-2 text-orange-500">· incompleto</span>}
                    </div>
                    <div className="flex gap-2">
                      {!complete && done > 0 && (
                        <button
                          className="rounded-xl border border-orange-300 px-4 py-2.5 text-sm font-semibold text-orange-600 bg-orange-50"
                          onClick={() => printClient(c)}
                        >
                          Stampa incompleto
                        </button>
                      )}
                      <button
                        className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all
                          ${complete ? "bg-black" : "bg-gray-300 cursor-not-allowed"}`}
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
