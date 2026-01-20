"use client";


import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Order = {
  id: string;
  catalog_id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  created_at: string;
  wa_status?: string | null;
  wa_error?: string | null;
  wa_last_attempt_at?: string | null;
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

  const [customerByPhone, setCustomerByPhone] = useState<Record<string, { company?: string | null }>>({});

  // ✅ Pulizia ordini
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deletePdfs, setDeletePdfs] = useState(true);

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  async function loadOrders() {
    setLoading(true);
    setMsg("");

    try {
      const { data, error } = await supabaseBrowser
        .from("orders")
        .select("id,catalog_id,customer_name,customer_phone,status,created_at,wa_status,wa_error,wa_last_attempt_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        setMsg("Errore caricando ordini: " + error.message);
        return;
      }

      setOrders((data || []) as any);
      
      try {
        const phones = Array.from(new Set((data || []).map((o: any) => String(o.customer_phone || "").trim()).filter(Boolean)));
        if (!phones.length) {
          setCustomerByPhone({});
        } else {
          const { data: custs, error: cErr } = await supabaseBrowser
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
setMsg(`✅ Ordini aggiornati: ${(data || []).length}`);
    } catch (e: any) {
      setMsg(e?.message ?? "Errore rete");
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(orderId: string) {
    setLoading(true);
    try {
      const { data, error } = await supabaseBrowser
        .from("order_items")
        .select("qty, products(id, progressive_number, box_number, image_path, is_sold, price_eur)")
        .eq("order_id", orderId);

      if (error) {
        alert(error.message);
        return;
      }

      setItemsByOrder((prev) => ({ ...prev, [orderId]: (data || []) as any }));
    } finally {
      setLoading(false);
    }
  }

  async function cancelOrder(orderId: string) {
    if (!confirm("Annullare questo ordine? Verranno rimosse le righe e le casse tornano disponibili.")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/cancel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Errore annullando ordine");
        return;
      }

      alert("Ordine annullato ✅");
      setItemsByOrder({});
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  async function unsellProduct(productId: string) {
    if (!confirm("Rimettere in vendita questa cassa?")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/unsell-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Errore rimettendo in vendita");
        return;
      }

      alert("Cassa rimessa in vendita ✅");
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  async function removeFromOrder(orderId: string, productId: string) {
    if (!confirm("Rimuovere questa cassa dall’ordine?")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/remove-order-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, productId }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Errore rimuovendo dall’ordine");
        return;
      }

      alert("Rimossa dall’ordine ✅");
      // ricarico items di quell’ordine e lista
      await loadItems(orderId);
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  async function retryWhatsApp(orderId: string) {
    if (!confirm("Riprovo l'invio WhatsApp per questo ordine?")) return;

    try {
      const res = await fetch("/api/admin/orders/retry-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json.error || "Errore nel reinvio WhatsApp");
        return;
      }

      alert(json.wa_status === "sent" ? "WhatsApp inviato ✅" : `Invio fallito: ${json.wa_error}`);
      await loadOrders();
    } catch (e: any) {
      alert(e?.message ?? "Errore rete");
    }
  }

  async function resendWhatsApp(orderId: string) {
    if (!confirm("Reinvia WhatsApp (con PDF aggiornato) per questo ordine?")) return;

    try {
      const res = await fetch("/api/admin/orders/resend-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json.error || "Errore reinvio WhatsApp");
        return;
      }

      alert(json.wa_status === "sent" ? "WhatsApp reinviato ✅" : `Invio fallito: ${json.wa_error}`);
      await loadOrders();
    } catch (e: any) {
      alert(e?.message ?? "Errore rete");
    }
  }

  async function markWhatsAppSent(orderId: string) {
    if (!confirm("Segno questo ordine come WhatsApp inviato?")) return;

    try {
      const res = await fetch("/api/admin/orders/mark-wa-sent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, deletePdf: true }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Errore aggiornando stato WhatsApp");
        return;
      }

      alert("Segnato come inviato ✅");
      await loadOrders();
    } catch (e: any) {
      alert(e?.message ?? "Errore rete");
    }
  }

  async function deleteOrdersRange() {
    if (!fromDate || !toDate) {
      alert("Inserisci sia Da che A (GG/MM/AAAA)");
      return;
    }
    if (!confirm(`Cancellare ordini dal ${fromDate} al ${toDate}?`)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/delete-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "range", from: fromDate, to: toDate, deletePdfs }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Errore pulizia ordini");
        return;
      }

      alert(`Cancellati: ordini=${json.deletedOrders}, righe=${json.deletedItems}, pdf=${json.deletedPdfs}`);
      setItemsByOrder({});
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  async function deleteOrdersAll() {
    if (!confirm("Cancellare TUTTI gli ordini?")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/delete-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", deletePdfs }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Errore pulizia ordini");
        return;
      }

      alert(`Cancellati: ordini=${json.deletedOrders}, righe=${json.deletedItems}, pdf=${json.deletedPdfs}`);
      setItemsByOrder({});
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          type="button"
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
            <label className="text-xs text-gray-600">Da (GG/MM/AAAA)</label>
            <input type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              placeholder="gg/mm/aaaa"
              className="rounded-lg border px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">A (GG/MM/AAAA)</label>
            <input type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              placeholder="gg/mm/aaaa"
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
            type="button"
            className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60"
            disabled={loading}
            onClick={() => window.open(`/admin/orders/print?mode=all&type=byOrder`, "_blank")}
          >
            Stampa tutti (cliente / casse / prezzo)
          </button>

          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60"
            disabled={loading}
            onClick={() => window.open(`/admin/orders/print?mode=all&type=byProduct`, "_blank")}
          >
            Stampa tutti (prodotto / clienti)
          </button>

          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60"
            disabled={loading || !fromDate || !toDate}
            onClick={() => window.open(`/admin/orders/print?mode=range&type=byOrder&from=&to=`, "_blank")}
          >
            Stampa X–Y (cliente / casse / prezzo)
          </button>

          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60"
            disabled={loading || !fromDate || !toDate}
            onClick={() => window.open(`/admin/orders/print?mode=range&type=byProduct&from=&to=`, "_blank")}
          >
            Stampa X–Y (prodotto / clienti)
          </button>

          <button
            type="button"
            className="rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
            disabled={loading}
            onClick={deleteOrdersRange}
          >
            Cancella da X a Y
          </button>

          <button
            type="button"
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
                  {o.customer_name} {customerByPhone[o.customer_phone]?.company ? `(${customerByPhone[o.customer_phone]?.company})` : ""} — {o.customer_phone}
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  {new Date(o.created_at).toLocaleString("it-IT")} • Stato: <b>{o.status}</b> • WA: <b>{o.wa_status ?? "—"}</b> • Ordine:{" "}
                  <span className="font-mono">{o.id.slice(0, 8)}…</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  disabled={loading}
                  onClick={() => loadItems(o.id)}
                >
                  Mostra casse
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-60"
                  disabled={loading}
                  onClick={() => cancelOrder(o.id)}
                >
                  Annulla ordine
                </button>

                <button
                  type="button"
                  className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  disabled={loading}
                  onClick={() => resendWhatsApp(o.id)}
                >
                  Reinvia WhatsApp (PDF aggiornato)
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 disabled:opacity-60"
                  disabled={loading || o.wa_status === "sent"}
                  onClick={() => retryWhatsApp(o.id)}
                >
                  Riprova WhatsApp
                </button>

                <button
                  type="button"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-60"
                  disabled={loading || o.wa_status === "sent"}
                  onClick={() => markWhatsAppSent(o.id)}
                >
                  Segna inviato
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
                          type="button"
                          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                          disabled={loading}
                          onClick={() => unsellProduct(p.id)}
                        >
                          Rimetti in vendita
                        </button>

                        <button
                          type="button"
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
