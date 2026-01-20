"use client";

import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function nowIT() {
  return new Date().toLocaleString("it-IT");
}

function eur(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `€ ${v.toFixed(2)}`;
}

type SearchParams = {
  mode?: string;
  from?: string;
  to?: string;
  type?: string; // byOrder | byProduct
};

export default async function PrintOrdersPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;

  const mode = sp.mode === "range" ? "range" : "all";
  const type = sp.type === "byProduct" ? "byProduct" : "byOrder";

  const from = (sp.from || "").trim();
  const to = (sp.to || "").trim();

  const supabase = supabaseServer();

  let q = supabase
    .from("orders")
    .select(
      "id,created_at,customer_name,customer_phone,status, order_items(qty, products(id,box_number,progressive_number,price_eur))"
    )
    .order("created_at", { ascending: false });

  if (mode === "range") {
    const fromIso = `${from}T00:00:00Z`;
    const toIso = `${to}T23:59:59Z`;
    q = q.gte("created_at", fromIso).lte("created_at", toIso);
  }

  const { data: orders, error } = await q;
  if (error) {
    return (
      <div style={{ padding: 20, fontFamily: "system-ui" }}>
        <h1>Errore</h1>
        <pre>{error.message}</pre>
      </div>
    );
  }

  const list = (orders || []).filter((o: any) => o?.status !== "failed");

  const printTitle =
    type === "byOrder" ? "Stampa ordini — Cliente / Casse / Prezzo" : "Stampa ordini — Prodotto / Clienti";

  const filterLabel =
    mode === "all" ? "Tutti gli ordini" : `Dal ${from} al ${to}`;

  const baseStyle: React.CSSProperties = {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    color: "#111",
  };

  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{printTitle}</title>
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; }
          }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
          th { background: #f5f5f5; text-align: left; }
          .h1 { font-size: 20px; font-weight: 800; margin: 0; }
          .meta { font-size: 12px; color: #444; margin-top: 6px; }
          .wrap { max-width: 980px; margin: 0 auto; padding: 18px; }
          .card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 12px; margin-top: 12px; }
          .row { display: flex; gap: 12px; align-items: center; justify-content: space-between; }
          .btn { border: 1px solid #111; background: #111; color: #fff; padding: 10px 14px; border-radius: 10px; font-weight: 700; cursor: pointer; }
          .btn2 { border: 1px solid #aaa; background: #fff; color: #111; padding: 10px 14px; border-radius: 10px; font-weight: 700; cursor: pointer; }
          .small { font-size: 12px; color: #555; }
          .mt8 { margin-top: 8px; }
          .mt12 { margin-top: 12px; }
        `}</style>
      </head>
      <body style={baseStyle}>
        <div className="wrap">
          <div className="row">
            <div>
              <div className="h1">{printTitle}</div>
              <div className="meta">
                {filterLabel} · Data stampa: {nowIT()} · Totale ordini: {list.length}
              </div>
            </div>

            <div className="no-print" style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => window.print()}>Stampa</button>
              <button className="btn2" onClick={() => window.close()}>Chiudi</button>
            </div>
          </div>

          {type === "byOrder" ? (
            <ByOrder orders={list as any[]} />
          ) : (
            <ByProduct orders={list as any[]} />
          )}
        </div>

        <script dangerouslySetInnerHTML={{ __html: `setTimeout(() => { try { window.print(); } catch(e) {} }, 300);` }} />
      </body>
    </html>
  );
}

function ByOrder({ orders }: { orders: any[] }) {
  return (
    <div className="mt12">
      {orders.map((o) => {
        let total = 0;
        const rows = (o.order_items || []).map((it: any) => {
          const p = it.products;
          const qty = Number(it.qty ?? 1);
          const price = p?.price_eur === null || p?.price_eur === undefined ? null : Number(p.price_eur);
          if (price !== null && Number.isFinite(price)) total += price * qty;

          return {
            box: p?.box_number ?? "?",
            prog: p?.progressive_number ?? "?",
            qty,
            price,
          };
        });

        return (
          <div className="card" key={o.id}>
            <div style={{ fontWeight: 800 }}>
              {o.customer_name} — {o.customer_phone} — Ordine {String(o.id).slice(0, 8)}…
            </div>
            <div className="small mt8">Creato: {new Date(o.created_at).toLocaleString("it-IT")}</div>

            <table className="mt12">
              <thead>
                <tr>
                  <th>Cassa</th>
                  <th>Prog</th>
                  <th>Q.tà</th>
                  <th>Prezzo</th>
                  <th>Totale riga</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx}>
                    <td>{r.box}</td>
                    <td>{r.prog}</td>
                    <td>{r.qty}</td>
                    <td>{eur(r.price)}</td>
                    <td>{r.price !== null ? eur(r.price * r.qty) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 10, fontWeight: 900 }}>Totale ordine: {eur(total)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ByProduct({ orders }: { orders: any[] }) {
  type K = string;
  const map = new Map<K, { box: any; prog: any; price: any; customers: { name: string; phone: string; qty: number }[] }>();

  for (const o of orders) {
    for (const it of o.order_items || []) {
      const p = it.products;
      const qty = Number(it.qty ?? 1);
      const key = `${p?.id || "?"}`;

      const cur = map.get(key) || {
        box: p?.box_number ?? "?",
        prog: p?.progressive_number ?? "?",
        price: p?.price_eur ?? null,
        customers: [],
      };

      cur.customers.push({
        name: String(o.customer_name || ""),
        phone: String(o.customer_phone || ""),
        qty,
      });

      map.set(key, cur);
    }
  }

  const products = Array.from(map.values()).sort((a, b) => {
    const ab = Number(a.box ?? 0);
    const bb = Number(b.box ?? 0);
    if (Number.isFinite(ab) && Number.isFinite(bb) && ab !== bb) return ab - bb;
    return String(a.prog).localeCompare(String(b.prog));
  });

  return (
    <div className="mt12">
      <table>
        <thead>
          <tr>
            <th>Cassa</th>
            <th>Prog</th>
            <th>Prezzo</th>
            <th>Clienti (q.tà)</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p, idx) => (
            <tr key={idx}>
              <td>{p.box}</td>
              <td>{p.prog}</td>
              <td>{eur(p.price)}</td>
              <td>
                {p.customers.map((c, i) => (
                  <div key={i}>
                    {c.name} — {c.phone} (x{c.qty})
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
