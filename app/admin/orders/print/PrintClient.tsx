"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const imgUrl = (path?: string | null) => {
  if (!path) return "";
  const v = String(path);
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `${base}/storage/v1/object/public/catalog-images/${v}`;
};

type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  created_at: string;
};

type OrderItemRow = {
  order_id: string;
  qty: number;
  products: {
    id: string;
    progressive_number: number | null;
    box_number: string | null;
    image_path?: string | null;
    price_eur: number | null;
    weight_kg?: number | null;
    peso_interno_kg?: number | null;
    specie?: string | null;
    numero_interno_cassa?: string | null;
    catalogs?: { title?: string | null; online_title?: string | null } | null;
  } | null;
};

function eur(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `€ ${v.toFixed(2)}`;
}

export default function OrdersPrintPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const type = (sp.get("type") || "byOrder").toLowerCase();
  const mode = (sp.get("mode") || "all").toLowerCase();
  const from = (sp.get("from") || "").trim();
  const to = (sp.get("to") || "").trim();
  // Filtri per stampa singola
  const singleOrderId = (sp.get("orderId") || "").trim();
  const singlePhone = (sp.get("phone") || "").trim();
  const singleName = (sp.get("name") || "").trim();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [customerByPhone, setCustomerByPhone] = useState<Record<string, { company?: string | null }>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      try {
        let q = supabaseBrowser()
          .from("orders")
          .select("id,customer_name,customer_phone,created_at")
          .order("created_at", { ascending: true })
          .limit(500);

        if (singleOrderId) {
          // stampa singolo ordine
          q = q.eq("id", singleOrderId);
        } else if (singlePhone) {
          // stampa singolo cliente
          q = q.eq("customer_phone", singlePhone);
        } else if (from && to) {
          q = q.gte("created_at", `${from}T00:00:00Z`).lte("created_at", `${to}T23:59:59Z`);
        }

        const { data: oData, error: oErr } = await q;
        if (oErr) throw oErr;

        const o = (oData || []) as Order[];
        setOrders(o);

        const orderIds = o.map((x) => x.id);
        if (!orderIds.length) {
          setItems([]);
          setCustomerByPhone({});
          return;
        }

        const { data: iData, error: iErr } = await supabaseBrowser()
          .from("order_items")
          .select("order_id,qty,products(id,progressive_number,box_number,image_path,price_eur,weight_kg,peso_interno_kg,specie,numero_interno_cassa,catalogs(title,online_title))")
          .in("order_id", orderIds);

        if (iErr) throw iErr;
        setItems((iData || []) as OrderItemRow[]);

        try {
          const phones = Array.from(new Set(o.map((x) => String(x.customer_phone || "").trim()).filter(Boolean)));

          if (!phones.length) {
            setCustomerByPhone({});
          } else {
            const { data: custs, error: cErr } = await supabaseBrowser()
              .from("customers")
              .select("phone, company")
              .in("phone", phones);

            if (cErr) throw cErr;

            const map: Record<string, { company?: string | null }> = {};
            for (const c of (custs || []) as any[]) {
              map[String(c.phone).trim()] = { company: c.company ?? null };
            }
            setCustomerByPhone(map);
          }
        } catch {
          setCustomerByPhone({});
        }
      } catch (e: any) {
        setErr(e?.message ?? "Errore caricando dati stampa");
      } finally {
        setLoading(false);
      }
    })();
  }, [from, to]);

  const itemsByOrder = useMemo(() => {
    const m: Record<string, OrderItemRow[]> = {};
    for (const r of items) {
      if (!m[r.order_id]) m[r.order_id] = [];
      m[r.order_id].push(r);
    }
    return m;
  }, [items]);

  const customerGroups = useMemo(() => {
    const gm: Record<
      string,
      {
        phone: string;
        name: string;
        company?: string | null;
        createdAts: string[];
        boxes: Record<string, { box: string; qty: number; price: number | null; specie?: string | null; weight_kg?: number | null; peso_interno_kg?: number | null; catalogo?: string | null; numero_interno_cassa?: string | null }>;
      }
    > = {};

    for (const o of orders) {
      const phone = String(o.customer_phone || "").trim() || "—";
      const custName = String(o.customer_name || "").trim() || "Cliente";
      const company = customerByPhone[phone]?.company ?? null;
      // Chiave composta: separa ordini dello stesso venditore per clienti diversi
      const groupKey = `${phone}|${custName}`;

      if (!gm[groupKey]) {
        gm[groupKey] = {
          phone,
          name: custName,
          company,
          createdAts: [],
          boxes: {},
        };
      }

      gm[groupKey].createdAts.push(o.created_at);

      const rows = itemsByOrder[o.id] || [];
      for (const r of rows) {
        const pr = r.products;
        if (!pr) continue;

        const box = String(pr.box_number || "?");
        const qty = Number(r.qty ?? 1);
        const price = pr.price_eur === null || pr.price_eur === undefined ? null : Number(pr.price_eur);

        const cat = pr.catalogs as any;
        const catalogo = (Array.isArray(cat) ? cat[0] : cat)?.online_title
          || (Array.isArray(cat) ? cat[0] : cat)?.title
          || null;

        if (!gm[groupKey].boxes[box]) {
          gm[groupKey].boxes[box] = {
            box,
            qty: 0,
            price,
            specie: pr.specie ?? null,
            weight_kg: pr.weight_kg ?? null,
            peso_interno_kg: pr.peso_interno_kg ?? null,
            catalogo,
            numero_interno_cassa: pr.numero_interno_cassa ?? null,
          };
        }

        gm[groupKey].boxes[box].qty += qty;

        if (gm[groupKey].boxes[box].price === null && price !== null) {
          gm[groupKey].boxes[box].price = price;
        }
      }
    }

    const arr = Object.values(gm).map((g) => {
      const boxesArr = Object.values(g.boxes).sort((a, b) => Number(a.box) - Number(b.box));
      let tot = 0;
      for (const b of boxesArr) {
        if (b.price !== null && Number.isFinite(b.price)) tot += b.price * b.qty;
      }
      const createdSorted = [...g.createdAts].sort();
      return {
        ...g,
        boxesArr,
        tot,
        createdMin: createdSorted[0] ?? null,
        createdMax: createdSorted[createdSorted.length - 1] ?? null,
        ordersCount: g.createdAts.length,
      };
    });

    arr.sort(
      (a, b) =>
        (a.name || "").localeCompare(b.name || "") ||
        (a.phone || "").localeCompare(b.phone || "")
    );

    return arr;
  }, [orders, itemsByOrder, customerByPhone]);

  const productView = useMemo(() => {
    // mappa prodotto → dati aggregati
    const pm: Record<string, {
      productId: string;
      box: string;
      prog: string | number;
      price: number | null;
      specie: string | null;
      weight_kg: number | null;
      peso_interno_kg: number | null;
      numero_interno_cassa: string | null;
      catalogo: string | null;
      imagePath?: string | null;
      customers: { name: string; company?: string | null; phone: string; qty: number }[];
    }> = {};

    const orderById: Record<string, Order> = {};
    for (const o of orders) orderById[o.id] = o;

    for (const row of items) {
      const p = row.products;
      if (!p) continue;
      const ord = orderById[row.order_id];
      if (!ord) continue;

      const phone = String(ord.customer_phone || "").trim();
      const company = customerByPhone[phone]?.company ?? null;
      const qty = Number(row.qty ?? 1);

      const cat = p.catalogs as any;
      const catalogo = (Array.isArray(cat) ? cat[0] : cat)?.online_title
        || (Array.isArray(cat) ? cat[0] : cat)?.title
        || null;

      if (!pm[p.id]) {
        pm[p.id] = {
          productId: p.id,
          box: p.box_number ?? "?",
          prog: p.progressive_number ?? "?",
          price: p.price_eur ?? null,
          specie: p.specie ?? null,
          weight_kg: p.weight_kg ?? null,
          peso_interno_kg: p.peso_interno_kg ?? null,
          numero_interno_cassa: p.numero_interno_cassa ?? null,
          catalogo,
          imagePath: p.image_path ?? null,
          customers: [],
        };
      }

      pm[p.id].customers.push({
        name: String(ord.customer_name || "").trim() || "Cliente",
        company,
        phone,
        qty,
      });
    }

    // raggruppa per specie
    const bySpecie: Record<string, typeof pm[string][]> = {};
    for (const prod of Object.values(pm)) {
      const key = prod.specie?.trim() || "—";
      if (!bySpecie[key]) bySpecie[key] = [];
      bySpecie[key].push(prod);
    }

    // ordina le casse per numero progressivo dentro ogni specie
    for (const arr of Object.values(bySpecie)) {
      arr.sort((a, b) => {
        const pa = Number(a.prog); const pb = Number(b.prog);
        if (Number.isFinite(pa) && Number.isFinite(pb)) return pa - pb;
        return String(a.box).localeCompare(String(b.box));
      });
    }

    // ordina i gruppi specie alfabeticamente (ma "—" in fondo)
    return Object.entries(bySpecie).sort(([a], [b]) => {
      if (a === "—") return 1;
      if (b === "—") return -1;
      return a.localeCompare(b);
    });
  }, [orders, items, customerByPhone]);

  // ── Vista per catalogo ──
  const catalogView = useMemo(() => {
    const cm: Record<string, {
      label: string;
      boxes: {
        box: string;
        prog: number | string;
        specie?: string | null;
        weight_kg?: number | null;
        peso_interno_kg?: number | null;
        numero_interno_cassa?: string | null;
        price: number | null;
        customers: { name: string; company?: string | null; phone: string }[];
      }[];
      tot: number;
    }> = {};

    const orderById: Record<string, Order> = {};
    for (const o of orders) orderById[o.id] = o;

    for (const row of items) {
      const p = row.products;
      if (!p) continue;
      const ord = orderById[row.order_id];
      if (!ord) continue;

      const cat = p.catalogs as any;
      const label = (Array.isArray(cat) ? cat[0] : cat)?.online_title
        || (Array.isArray(cat) ? cat[0] : cat)?.title
        || "Senza catalogo";

      const phone = String(ord.customer_phone || "").trim();
      const company = customerByPhone[phone]?.company ?? null;
      const custName = String(ord.customer_name || "").trim() || "Cliente";

      if (!cm[label]) cm[label] = { label, boxes: [], tot: 0 };

      const existing = cm[label].boxes.find((b) => b.box === String(p.box_number || "?"));
      if (existing) {
        // Dedup per phone+name: stesso venditore per clienti diversi = voci separate
        if (!existing.customers.find((c) => c.phone === phone && c.name === custName)) {
          existing.customers.push({ name: custName, company, phone });
        }
      } else {
        cm[label].boxes.push({
          box: String(p.box_number || "?"),
          prog: p.progressive_number ?? "?",
          specie: p.specie ?? null,
          weight_kg: p.weight_kg ?? null,
          peso_interno_kg: p.peso_interno_kg ?? null,
          numero_interno_cassa: p.numero_interno_cassa ?? null,
          price: p.price_eur ?? null,
          customers: [{ name: custName, company, phone }],
        });
      }

      if (p.price_eur != null) cm[label].tot += Number(p.price_eur);
    }

    return Object.values(cm).sort((a, b) => a.label.localeCompare(b.label));
  }, [orders, items, customerByPhone]);

  const title = useMemo(() => {
    if (singleOrderId) return `Ordine — preparazione`;
    if (singlePhone) return `Ordine ${singleName || singlePhone}`;
    const range = from && to ? `(${from} → ${to})` : "(tutti)";
    if (type === "byproduct") return `Stampa per prodotti ${range}`;
    if (type === "bycatalog") return `Stampa per catalogo ${range}`;
    return `Stampa ordini per cliente ${range}`;
  }, [type, from, to, singleOrderId, singlePhone, singleName]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="text-lg font-bold">Carico stampa…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="text-lg font-bold">Errore</div>
        <div className="mt-2 text-sm text-red-700">{err}</div>
        <div className="mt-4 flex gap-2">
          <button
            className="rounded-lg border bg-white px-4 py-2 font-semibold"
            onClick={() => {
              try {
                router.push("/admin/orders");
              } catch {}
              try {
                window.close();
              } catch {}
            }}
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <button
          className="rounded-lg border bg-white px-4 py-2 font-semibold"
          onClick={() => {
            try {
              router.push("/admin/orders");
            } catch {}
            try {
              window.close();
            } catch {}
          }}
        >
          Chiudi
        </button>
        <div className="flex gap-2">
          <button className="rounded-lg bg-black px-4 py-2 font-semibold text-white" onClick={() => window.print()}>
            Stampa
          </button>
        </div>
      </div>

      <div className="mb-3 text-center">
        <div className="text-2xl font-bold">{title}</div>
        <div className="text-sm text-gray-600">Stampato il {new Date().toLocaleString("it-IT")}</div>
      </div>

      {type === "bycatalog" ? (
        /* ── Vista per catalogo ── */
        <div className="space-y-4">
          {catalogView.map((cat) => (
            <div key={cat.label} className="rounded-2xl border bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
                <div className="text-lg font-bold">{cat.label}</div>
                <div className="text-sm font-semibold text-gray-700">Totale: € {Number(cat.tot).toFixed(2)}</div>
              </div>
              <div className="mt-3 grid gap-3">
                {cat.boxes.map((b, idx) => (
                  <div key={idx} className="text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                        <span className="font-semibold">Cassa {b.box}</span>
                        {b.numero_interno_cassa && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                            N° coop: {b.numero_interno_cassa}
                          </span>
                        )}
                        {b.specie && <span className="text-gray-700">— {b.specie}</span>}
                        {(b.weight_kg != null || b.peso_interno_kg != null) && (
                          <span className="text-gray-500">
                            {b.weight_kg != null && <>pub. {Number(b.weight_kg).toFixed(2)} kg</>}
                            {b.weight_kg != null && b.peso_interno_kg != null && <> · </>}
                            {b.peso_interno_kg != null && <>int. {Number(b.peso_interno_kg).toFixed(2)} kg</>}
                          </span>
                        )}
                      </div>
                      <div className="font-semibold whitespace-nowrap">{eur(b.price)}</div>
                    </div>
                    <div className="mt-1 ml-3 text-gray-600">
                      {b.customers.map((c, ci) => (
                        <span key={ci}>
                          {c.name}{c.company ? ` (${c.company})` : ""}{ci < b.customers.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {catalogView.length === 0 && (
            <div className="text-sm text-gray-600">Nessun ordine nel periodo selezionato.</div>
          )}
        </div>
      ) : type !== "byproduct" ? (
        /* ── Vista per cliente ── */
        <div className="space-y-4">
          {customerGroups.map((g) => (
            <div key={`${g.phone}|${g.name}`} className="rounded-2xl border bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-lg font-bold">
                  {g.name} {g.company ? `(${g.company})` : ""} — {g.phone}
                </div>
                <div className="text-sm text-gray-600">
                  {g.ordersCount > 1
                    ? `${g.ordersCount} ordini — ${new Date(g.createdMin!).toLocaleString("it-IT")} → ${new Date(g.createdMax!).toLocaleString("it-IT")}`
                    : `${new Date(g.createdMin!).toLocaleString("it-IT")}`}
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {g.boxesArr.map((b, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span>• Cassa {b.box} × {b.qty}</span>
                      {b.numero_interno_cassa && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                          N° coop: {b.numero_interno_cassa}
                        </span>
                      )}
                      {b.specie && <span className="text-gray-700">— {b.specie}</span>}
                      {b.catalogo && <span className="text-gray-500 italic">[{b.catalogo}]</span>}
                      {(b.weight_kg != null || b.peso_interno_kg != null) && (
                        <span className="text-gray-500">
                          {b.weight_kg != null && <>pub. {Number(b.weight_kg).toFixed(2)} kg</>}
                          {b.weight_kg != null && b.peso_interno_kg != null && <> · </>}
                          {b.peso_interno_kg != null && <>int. {Number(b.peso_interno_kg).toFixed(2)} kg</>}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold whitespace-nowrap">{eur(b.price)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 text-right font-bold">Totale: € {Number(g.tot).toFixed(2)}</div>
            </div>
          ))}

          {customerGroups.length === 0 && (
            <div className="text-sm text-gray-600">Nessun ordine nel periodo selezionato.</div>
          )}
        </div>
      ) : (
        /* ── Vista per prodotti raggruppata per specie ── */
        <div className="space-y-6">
          {productView.map(([specie, boxes]) => (
            <div key={specie}>
              {/* intestazione specie */}
              <div className="mb-3 flex items-center gap-3">
                <div className="text-lg font-extrabold tracking-wide">{specie}</div>
                <div className="flex-1 border-t" />
                <div className="text-sm text-gray-500">{boxes.length} {boxes.length === 1 ? "cassa" : "casse"}</div>
              </div>

              <div className="space-y-3">
                {boxes.map((p) => (
                  <div key={p.productId} className="rounded-2xl border bg-white p-4">
                    <div className="flex items-start gap-3">
                      <img src={imgUrl(p.imagePath)} className="h-14 w-14 flex-shrink-0 rounded-xl border object-cover" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex flex-wrap items-baseline gap-x-2 font-bold">
                            <span>Cassa {p.box}</span>
                            {p.numero_interno_cassa && (
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                                N° coop: {p.numero_interno_cassa}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold whitespace-nowrap">{eur(p.price)}</div>
                        </div>

                        {/* peso e provenienza */}
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                          {p.weight_kg != null && <span>pub. {Number(p.weight_kg).toFixed(2)} kg</span>}
                          {p.peso_interno_kg != null && <span>int. {Number(p.peso_interno_kg).toFixed(2)} kg</span>}
                          {p.catalogo && <span className="italic">[{p.catalogo}]</span>}
                        </div>

                        {/* clienti */}
                        <div className="mt-2 grid gap-0.5 text-sm text-gray-700">
                          {p.customers.map((c, idx) => (
                            <div key={idx}>
                              • {c.name}{c.company ? ` (${c.company})` : ""} — {c.phone}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {productView.length === 0 && (
            <div className="text-sm text-gray-600">Nessun ordine nel periodo selezionato.</div>
          )}
        </div>
      )}
    </div>
  );
}
