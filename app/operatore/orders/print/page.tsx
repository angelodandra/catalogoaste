"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

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
  qty: number;
};

type ClientBlock = {
  name: string;
  phone: string;
  company: string | null;
  createdAt: string;
  products: Product[];
};

function PrintInner() {
  const sp = useSearchParams();
  const layout = (sp.get("layout") || "detailed").toLowerCase();
  const singlePhone = (sp.get("phone") || "").trim();
  const singleName = (sp.get("name") || "").trim();
  const singleOrderId = (sp.get("orderId") || "").trim();
  const from = (sp.get("from") || "").trim();
  const to = (sp.get("to") || "").trim();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [blocks, setBlocks] = useState<ClientBlock[]>([]);
  const [printHtml, setPrintHtml] = useState<string | null>(null);

  const isSingleClient = !!singlePhone;
  const isSingleOrder = !!singleOrderId;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        let q = supabaseBrowser()
          .from("orders")
          .select("id, customer_name, customer_phone, created_at")
          .order("customer_name", { ascending: true })
          .limit(500);

        if (singleOrderId) {
          q = q.eq("id", singleOrderId);
        } else if (singlePhone) {
          q = q.eq("customer_phone", singlePhone);
        } else if (from && to) {
          q = q.gte("created_at", `${from}T00:00:00Z`).lte("created_at", `${to}T23:59:59Z`);
        }

        const { data: orders, error: oErr } = await q;
        if (oErr) throw oErr;
        if (!orders?.length) { setBlocks([]); setLoading(false); return; }

        const orderIds = orders.map((o: any) => o.id);
        const { data: items, error: iErr } = await supabaseBrowser()
          .from("order_items")
          .select("order_id, qty, products(id, box_number, progressive_number, image_path, price_eur, weight_kg, peso_interno_kg, specie, numero_interno_cassa, catalogs(title, online_title))")
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
            qty: Number(row.qty ?? 1),
          });
        }

        const clientMap: Record<string, ClientBlock> = {};
        for (const o of orders as any[]) {
          const phone = String(o.customer_phone || "").trim();
          const name = String(o.customer_name || "").trim() || "Cliente";
          const key = `${phone}|${name}`;
          if (!clientMap[key]) {
            clientMap[key] = { phone, name, company: companyMap[phone] ?? null, createdAt: o.created_at, products: [] };
          }
          clientMap[key].products.push(...(itemsByOrder[o.id] || []));
        }

        const result: ClientBlock[] = [];
        for (const c of Object.values(clientMap)) {
          const seen = new Set<string>();
          c.products = c.products.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
          c.products.sort((a, b) => (a.progressive_number ?? 999) - (b.progressive_number ?? 999));
          result.push(c);
        }
        result.sort((a, b) => a.name.localeCompare(b.name));
        setBlocks(result);
      } catch (e: any) {
        setErr(e?.message ?? "Errore caricamento");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Costruisce l'HTML da stampare ────────────────────────────────────────
  function buildHtml(withPhotos: boolean) {
    const now = new Date().toLocaleString("it-IT");
    const titleText = isSingleOrder
      ? "Preparazione merce"
      : isSingleClient
      ? `Preparazione — ${singleName || singlePhone}`
      : from && to
      ? `Preparazione merce (${from} → ${to})`
      : "Preparazione merce (cumulativo)";

    const clientsHtml = blocks.map((c, idx) => {
      const isLast = idx === blocks.length - 1;

      const productsHtml = c.products.map((p) => {
        const coop = p.numero_interno_cassa
          ? `<span style="background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px;">N° coop: ${p.numero_interno_cassa}</span>`
          : "";
        const qty = p.qty > 1 ? ` ×${p.qty}` : "";
        const specie = p.specie ? `<div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.03em;margin-top:2px;">${p.specie}</div>` : "";
        const weights: string[] = [];
        if (p.peso_interno_kg != null) weights.push(`Peso int. ${Number(p.peso_interno_kg).toFixed(2)} kg`);
        if (p.weight_kg != null) weights.push(`Peso "H" ${Number(p.weight_kg).toFixed(2)} kg`);
        const weightsHtml = weights.length
          ? `<div style="font-size:11px;color:#666;margin-top:2px;">${weights.join(" | ")}</div>`
          : "";
        const catalogo = p.catalogo
          ? `<div style="font-size:11px;color:#888;font-style:italic;margin-top:1px;">${p.catalogo}</div>`
          : "";
        const photo = withPhotos && p.image_path
          ? `<img src="${imgUrl(p.image_path)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;flex-shrink:0;" />`
          : withPhotos
          ? `<div style="width:72px;height:72px;background:#f3f4f6;border-radius:8px;border:1px solid #e5e7eb;flex-shrink:0;"></div>`
          : "";

        return `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0;page-break-inside:avoid;">
            <div style="width:20px;height:20px;border:2px solid #333;border-radius:3px;flex-shrink:0;margin-top:4px;"></div>
            ${photo}
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:700;">Cassa ${p.box_number ?? "?"}${qty}${coop}</div>
              ${specie}${weightsHtml}${catalogo}
            </div>
            <div style="font-size:14px;font-weight:700;white-space:nowrap;flex-shrink:0;">${eur(p.price_eur)}</div>
          </div>`;
      }).join("");

      return `
        <div style="${isLast ? "" : "page-break-after:always;"}padding:0;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px;">
            <div style="font-size:18px;font-weight:800;">${c.name}${c.company ? ` (${c.company})` : ""}</div>
            <div style="font-size:11px;color:#666;">${fmtDate(c.createdAt)}</div>
          </div>
          ${productsHtml}
          <div style="margin-top:16px;font-size:11px;color:#aaa;text-align:center;">
            Spunte: usa la casella a sinistra per segnare la cassa preparata.
          </div>
        </div>`;
    }).join("");

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${titleText}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #111; padding: 24px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <!-- Barra stampa (nascosta in stampa) -->
  <div class="no-print" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #eee;">
    <button onclick="window.close()" style="padding:8px 16px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">✕ Chiudi</button>
    <div style="text-align:center;">
      <div style="font-size:16px;font-weight:700;">${titleText}</div>
      <div style="font-size:12px;color:#888;">Stampa: ${now}</div>
    </div>
    <button onclick="window.print()" style="padding:8px 20px;background:#000;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;">🖨️ Stampa</button>
  </div>
  ${clientsHtml}
</body>
</html>`;
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-500">Caricamento…</div>
  );
  if (err) return <div className="p-8 text-red-600">{err}</div>;
  if (!blocks.length) return <div className="p-8 text-gray-500">Nessun ordine trovato.</div>;

  // Costruisce e mostra subito l'HTML nell'iframe
  const withPhotos = layout === "detailed";
  const html = buildHtml(withPhotos);

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      {/* Barra superiore (fuori dall'iframe) */}
      <div className="flex items-center justify-between border-b px-4 py-3 print:hidden flex-shrink-0">
        <button
          className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50"
          onClick={() => window.close()}
        >
          ✕ Chiudi
        </button>
        <span className="text-sm font-medium text-gray-600">
          {blocks.length} {blocks.length === 1 ? "cliente" : "clienti"}
        </span>
        <button
          className="rounded-lg bg-black px-5 py-2 text-sm font-bold text-white"
          onClick={() => {
            const iframe = document.getElementById("print-iframe") as HTMLIFrameElement;
            iframe?.contentWindow?.print();
          }}
        >
          🖨️ Stampa
        </button>
      </div>
      {/* Iframe con il contenuto */}
      <iframe
        id="print-iframe"
        srcDoc={html}
        className="flex-1 w-full border-0"
        title="Stampa preparazione"
      />
    </div>
  );
}

export default function OperatorePrintPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-gray-500">Caricamento…</div>}>
      <PrintInner />
    </Suspense>
  );
}
