"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Order = {
  id: string;
  catalog_id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  created_at: string;
};

type OrderItemRow = {
  qty: number;
  products: {
    id: string;
    progressive_number: number;
    box_number: string;
    image_path: string;
    is_sold: boolean;
    price_eur: number | null;
  } | null;
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // ✅ Pulizia ordini
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deletePdfs, setDeletePdfs] = useState(true);

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  async function loadOrders() {
    setMsg("");
    const { data, error } = await supabaseBrowser
      .from("orders")
      .select("id,catalog_id,customer_name,customer_phone,status,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setMsg("Errore caricamento ordini");
      return;
    }

    setOrders((data as any) || []);
  }

  async function loadItems(orderId: string) {
    const { data, error } = await supabaseBrowser
      .from("order_items")
      .select("qty, products(id, progressive_number, box_number, image_path, is_sold, price_eur)")
      .eq("order_id", orderId);

    if (error) return;

    setItemsByOrder((prev) => ({ ...prev, [orderId]: ((data as any) || []) as OrderItemRow[] }));
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function cancelOrder(orderId: string) {
    const ok = confirm("Annullare ordine? Rimette in vendita TUTTE le casse di quell'ordine.");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/cancel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json();
      if (!res.ok) return alert(json.error || "Errore annullamento");

      alert(`Ordine annullato ✅ Ripristinate ${json.restored} casse`);
      await loadOrders();
      await loadItems(orderId);
    } finally {
      setLoading(false);
    }
  }

  async function unsellProduct(productId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/unsell-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const json = await res.json();
      if (!res.ok) return alert(json.error || "Errore ripristino");

      alert("Cassa rimessa in vendita ✅");
    } finally {
      setLoading(false);
    }
  }

  async function removeFromOrder(orderId: string, productId: string) {
    const ok = confirm("Rimuovere questa cassa dall’ordine? (la rimette in vendita)");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/remove-order-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, productId }),
      });
      const json = await res.json();
      if (!res.ok) return alert(json.error || "Errore rimozione");

      alert("Rimosso dall’ordine e rimesso in vendita ✅");
      await loadItems(orderId);
    } finally {
      setLoading(false);
    }
  }

  // ✅ Pulizia: cancella tutti
  async function deleteOrdersAll() {
    const ok = confirm(
      "Sei sicuro?\n\nCancella TUTTI gli ordini e le righe ordine.\nOperazione irreversibile."
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/delete-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", deletePdfs }),
      });
      const json = await res.json();
      if (!res.ok) return alert(json.error || "Errore cancellazione");

      alert(`Cancellati: ordini=${json.deletedOrders}, righe=${json.deletedItems}, pdf=${json.deletedPdfs}`);
      setItemsByOrder({});
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  // ✅ Pulizia: cancella range
  async function deleteOrdersRange() {
    if (!fromDate || !toDate) {
      alert("Inserisci From e To (YYYY-MM-DD)");
      return;
    }

    const ok = confirm(
      `Sei sicuro?\n\nCancella ordini dal ${fromDate} al ${toDate}.\nOperazione irreversibile.`
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/delete-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "range", from: fromDate, to: toDate, deletePdfs }),
      });
      const json = await res.json();
      if (!res.ok) return alert(json.error || "Errore cancellazione");

      alert(`Cancellati: ordini=${json.deletedOrders}, righe=${json.deletedItems}, pdf=${json.deletedPdfs}`);
      setItemsByOrder({});
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <img src="/logo.jpg" alt="Logo azienda" className="h-20 w-auto" />
        <div className="text-2xl font-bold">Ordini</div>
        <div className="text-sm text-gray-600">Gestisci annulli, ripristina casse e pulisci ordini</div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <a className="rounded-lg border bg-white px-4 py-2 font-semibold" href="/admin">
          ← Torna in Admin
        </a>

        <button
          className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60"
          disabled={loading}
          onClick={loadOrders}
        >
          Aggiorna
        </button>
      </div>

      {/* ✅ BOX PULIZIA */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-bold">Pulizia ordini</div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Da (YYYY-MM-DD)</label>
            <input
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              placeholder="2026-01-18"
              className="rounded-lg border px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">A (YYYY-MM-DD)</label>
            <input
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              placeholder="2026-01-18"
              className="rounded-lg border px-3 py-2"
            />
          </div>

          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={deletePdfs} onChange={(e) => setDeletePdfs(e.target.checked)} />
              Cancella anche i PDF
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
            disabled={loading}
            onClick={deleteOrdersRange}
          >
            Cancella da X a Y
          </button>

          <button
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-bold text-red-700 disabled:opacity-60"
            disabled={loading}
            onClick={deleteOrdersAll}
          >
            Cancella tutti gli ordini
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-600">
          Nota: la pulizia rimuove ordini/righe (e opzionalmente i PDF). Non cambia lo stato delle casse.
        </div>
      </div>

      {msg && <div className="mb-3 text-sm">{msg}</div>}

      <div className="grid gap-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-base font-bold">
                  {o.customer_name} — {o.customer_phone}
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  {new Date(o.created_at).toLocaleString("it-IT")} • Stato: <b>{o.status}</b> • Ordine:{" "}
                  <span className="font-mono">{o.id.slice(0, 8)}…</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  disabled={loading}
                  onClick={() => loadItems(o.id)}
                >
                  Mostra casse
                </button>

                <button
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-60"
                  disabled={loading}
                  onClick={() => cancelOrder(o.id)}
                >
                  Annulla ordine
                </button>
              </div>
            </div>

            {(itemsByOrder[o.id] || []).length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(itemsByOrder[o.id] || []).map((it, idx) => {
                  const p = it.products;
                  if (!p) return null;
                  const imgUrl = `${base}/storage/v1/object/public/catalog-images/${p.image_path}`;

                  return (
                    <div key={p.id + ":" + idx} className="rounded-2xl border bg-gray-50 p-3">
                      <div className="relative">
                        <img src={imgUrl} className="h-40 w-full rounded-xl object-cover" />
                        <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white">
                          {p.progressive_number}
                        </div>
                        <div className="absolute left-2 bottom-2 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold">
                          Cassa {p.box_number}
                        </div>
                        {p.price_eur !== null && (
                          <div className="absolute right-2 bottom-2 rounded-md bg-black/80 px-2 py-1 text-xs font-bold text-white">
                            € {Number(p.price_eur).toFixed(2)}
                          </div>
                        )}
                      </div>

                      <div className="mt-2 text-xs text-gray-600">Q.tà: {it.qty}</div>

                      <div className="mt-2 flex gap-2">
                        <button
                          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                          disabled={loading}
                          onClick={() => unsellProduct(p.id)}
                        >
                          Rimetti in vendita
                        </button>

                        <button
                          className="flex-1 rounded-lg bg-black px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                          disabled={loading}
                          onClick={() => removeFromOrder(o.id, p.id)}
                        >
                          Rimuovi dall’ordine
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
