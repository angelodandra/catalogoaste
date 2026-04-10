"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
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
  order_id?: string;
  qty: number;
  products: {
    id: string;
    progressive_number: number;
    box_number: string;
    image_path: string;
    is_sold: boolean;
    price_eur: number | null;
    specie?: string | null;
  } | null;
};

type ClientGroup = {
  key: string;
  name: string;
  phone: string;
  company?: string | null;
  orderIds: string[];
  latestAt: string;
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // PDF overlay — compatibile Safari iOS
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  function closePdfOverlay() {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
  }

  const [customerByPhone, setCustomerByPhone] = useState<Record<string, { company?: string | null }>>({});

  // Pulizia ordini
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deletePdfs, setDeletePdfs] = useState(true);

  // Vista per cliente
  const [viewMode, setViewMode] = useState<"orders" | "clients">("orders");
  const [allItemsLoaded, setAllItemsLoaded] = useState(false);
  const [clientWaLoading, setClientWaLoading] = useState<string | null>(null);
  const [clientConfirmWaLoading, setClientConfirmWaLoading] = useState<string | null>(null);
  const [clientPdfLoading, setClientPdfLoading] = useState<string | null>(null);
  const [clientWaLinkLoading, setClientWaLinkLoading] = useState<string | null>(null);

  // Traccia quali ordini/clienti hanno le casse espanse esplicitamente
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  // Ricerca
  const [searchQuery, setSearchQuery] = useState("");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  // ─── Gruppi per cliente ───────────────────────────────────────────────────
  const clientGroups = useMemo<ClientGroup[]>(() => {
    const map: Record<string, ClientGroup> = {};
    for (const o of orders) {
      const phone = String(o.customer_phone || "").trim();
      const name = String(o.customer_name || "").trim();
      const key = `${phone}__${name}`;
      if (!map[key]) {
        map[key] = {
          key,
          name: name || phone,
          phone,
          company: customerByPhone[phone]?.company ?? null,
          orderIds: [o.id],
          latestAt: o.created_at,
        };
      } else {
        map[key].orderIds.push(o.id);
        if (o.created_at > map[key].latestAt) map[key].latestAt = o.created_at;
      }
    }
    return Object.values(map).sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  }, [orders, customerByPhone]);

  // ─── Liste filtrate per ricerca ───────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return orders;
    return orders.filter((o) => {
      const company = customerByPhone[o.customer_phone]?.company ?? "";
      return (
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.includes(q) ||
        (company as string).toLowerCase().includes(q)
      );
    });
  }, [orders, searchQuery, customerByPhone]);

  const filteredClientGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return clientGroups;
    return clientGroups.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      g.phone.includes(q) ||
      (g.company ?? "").toLowerCase().includes(q)
    );
  }, [clientGroups, searchQuery]);

  function getClientItems(group: ClientGroup): OrderItemRow[] {
    const all: OrderItemRow[] = [];
    for (const oid of group.orderIds) {
      all.push(...(itemsByOrder[oid] || []));
    }
    return all;
  }

  // ─── Caricamento ordini ───────────────────────────────────────────────────
  async function loadOrders() {
    setLoading(true);
    setMsg("");
    try {
      const { data, error } = await supabaseBrowser()
        .from("orders")
        .select("id,catalog_id,customer_name,customer_phone,status,created_at,wa_status,wa_error,wa_last_attempt_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) { setMsg("Errore caricando ordini: " + error.message); return; }

      setOrders((data || []) as any);
      // Reset espansi quando si aggiornano gli ordini
      setExpandedOrders(new Set());
      setExpandedClients(new Set());

      try {
        const phones = Array.from(new Set((data || []).map((o: any) => String(o.customer_phone || "").trim()).filter(Boolean)));
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
      } catch { setCustomerByPhone({}); }

      setMsg(`✅ Ordini aggiornati: ${(data || []).length}`);
    } catch (e: any) {
      setMsg(e?.message ?? "Errore rete");
    } finally {
      setLoading(false);
    }
  }

  // ─── Carica items singolo ordine ─────────────────────────────────────────
  async function loadItems(orderId: string) {
    setLoading(true);
    try {
      const { data, error } = await supabaseBrowser()
        .from("order_items")
        .select("order_id, qty, products(id, progressive_number, box_number, image_path, is_sold, price_eur, specie)")
        .eq("order_id", orderId);
      if (error) { alert(error.message); return; }
      setItemsByOrder((prev) => ({ ...prev, [orderId]: (data || []) as any }));
      // Segna l'ordine come espanso esplicitamente
      setExpandedOrders((prev) => new Set([...prev, orderId]));
    } finally {
      setLoading(false);
    }
  }

  // ─── Carica TUTTI gli items in bulk (per vista per cliente) ───────────────
  async function loadAllItemsBulk() {
    if (!orders.length) return;
    setLoading(true);
    setMsg("Caricamento casse in corso…");
    try {
      const { data, error } = await supabaseBrowser()
        .from("order_items")
        .select("order_id, qty, products(id, progressive_number, box_number, image_path, is_sold, price_eur, specie)")
        .in("order_id", orders.map((o) => o.id));
      if (error) { setMsg("Errore casse: " + error.message); return; }
      const byOrder: Record<string, OrderItemRow[]> = {};
      for (const it of (data || []) as any[]) {
        const oid = String(it.order_id);
        if (!byOrder[oid]) byOrder[oid] = [];
        byOrder[oid].push(it);
      }
      setItemsByOrder((prev) => ({ ...prev, ...byOrder }));
      setAllItemsLoaded(true);
      setMsg("✅ Casse caricate");
    } finally {
      setLoading(false);
    }
  }

  // ─── Azioni singolo ordine ────────────────────────────────────────────────
  async function cancelOrder(orderId: string) {
    if (!confirm("Annullare questo ordine? Verranno rimosse le righe e le casse tornano disponibili.")) return;
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/cancel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Errore annullando ordine"); return; }
      alert("Ordine annullato ✅");
      setItemsByOrder({});
      setAllItemsLoaded(false);
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  async function unsellProduct(productId: string) {
    if (!confirm("Rimettere in vendita questa cassa?")) return;
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/unsell-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Errore rimettendo in vendita"); return; }
      alert("Cassa rimessa in vendita ✅");
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  async function removeFromOrder(orderId: string, productId: string) {
    if (!confirm("Rimuovere questa cassa dall'ordine?")) return;
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/remove-order-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, productId }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Errore rimuovendo dall'ordine"); return; }

      // Controlla se l'ordine è rimasto vuoto
      const { data: remaining } = await supabaseBrowser()
        .from("order_items")
        .select("id")
        .eq("order_id", orderId);

      if ((remaining || []).length === 0) {
        // Ultima cassa rimossa → cancella automaticamente l'ordine
        await adminFetch("/api/admin/cancel-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        alert("Ultima cassa rimossa: ordine annullato automaticamente ✅");
        setItemsByOrder((prev) => { const n = { ...prev }; delete n[orderId]; return n; });
        setAllItemsLoaded(false);
      } else {
        alert("Rimossa dall'ordine ✅");
        await loadItems(orderId);
      }

      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  async function retryWhatsApp(orderId: string) {
    if (!confirm("Riprovo l'invio WhatsApp per questo ordine?")) return;
    try {
      const res = await adminFetch("/api/admin/orders/retry-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Errore nel reinvio WhatsApp"); return; }
      alert(json.wa_status === "sent" ? "WhatsApp inviato ✅" : `Invio fallito: ${json.wa_error}`);
      await loadOrders();
    } catch (e: any) { alert(e?.message ?? "Errore rete"); }
  }

  async function resendWhatsApp(orderId: string) {
    if (!confirm("Reinvia WhatsApp (con PDF aggiornato) per questo ordine?")) return;
    try {
      const res = await adminFetch("/api/admin/orders/resend-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Errore reinvio WhatsApp"); return; }
      alert(json.wa_status === "sent" ? "WhatsApp reinviato ✅" : `Invio fallito: ${json.wa_error}`);
      await loadOrders();
    } catch (e: any) { alert(e?.message ?? "Errore rete"); }
  }

  async function markWhatsAppSent(orderId: string) {
    if (!confirm("Segno questo ordine come WhatsApp inviato?")) return;
    try {
      const res = await adminFetch("/api/admin/orders/mark-wa-sent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, deletePdf: true }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Errore aggiornando stato WhatsApp"); return; }
      alert("Segnato come inviato ✅");
      await loadOrders();
    } catch (e: any) { alert(e?.message ?? "Errore rete"); }
  }

  // ─── Azioni per cliente ───────────────────────────────────────────────────
  async function cancelAllForClient(group: ClientGroup) {
    if (!confirm(`Annullare tutti i ${group.orderIds.length} ordini di ${group.name}?\nLe casse torneranno disponibili.`)) return;
    setLoading(true);
    try {
      for (const oid of group.orderIds) {
        const res = await adminFetch("/api/admin/cancel-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: oid }),
        });
        if (!res.ok) {
          const j = await res.json();
          alert(`Errore su ordine ${oid.slice(0, 8)}: ${j.error}`);
          return;
        }
      }
      alert("Tutti gli ordini annullati ✅");
      setItemsByOrder({});
      setAllItemsLoaded(false);
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  async function printClientPrep(group: ClientGroup) {
    setClientPdfLoading(group.key);
    try {
      const qs = group.orderIds.map((id) => `orderIds=${encodeURIComponent(id)}`).join("&");
      const res = await adminFetch(`/api/admin/orders/prep-pdf-bulk?${qs}`);
      if (!res.ok) { alert("Errore generazione PDF"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } finally {
      setClientPdfLoading(null);
    }
  }

  async function sendClientWhatsApp(group: ClientGroup) {
    if (!confirm(`Invia WhatsApp a ${group.name} (${group.phone}) con tutti i prodotti ordinati?`)) return;
    setClientWaLoading(group.key);
    try {
      const res = await adminFetch("/api/admin/orders/client-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: group.orderIds, phone: group.phone, name: group.name }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Errore invio WhatsApp"); return; }
      alert(j.wa_status === "sent" ? "WhatsApp inviato ✅" : `Invio fallito: ${j.wa_error}`);
    } catch (e: any) {
      alert(e?.message ?? "Errore rete");
    } finally {
      setClientWaLoading(null);
    }
  }

  // Invia al cliente la CONFERMA ORDINE (formato cliente: peso esterno, senza dati interni)
  async function sendClientConfirmWhatsApp(group: ClientGroup) {
    if (!confirm(`Invia conferma ordine a ${group.name} (${group.phone})?\nIl cliente riceverà il riepilogo con peso, prezzo e provenienza.`)) return;
    setClientConfirmWaLoading(group.key);
    try {
      const res = await adminFetch("/api/admin/orders/client-confirm-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: group.orderIds, phone: group.phone, name: group.name }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Errore invio WhatsApp"); return; }
      alert(j.wa_status === "sent" ? "Conferma inviata al cliente ✅" : `Invio fallito: ${j.wa_error}`);
    } catch (e: any) {
      alert(e?.message ?? "Errore rete");
    } finally {
      setClientConfirmWaLoading(null);
    }
  }

  // Apre WhatsApp direttamente con messaggio formattato + link PDF (no Twilio)
  async function openWaClienteLink(group: ClientGroup) {
    setClientWaLinkLoading(group.key);

    // Apre la finestra SUBITO (sincrono) — Safari iOS blocca window.open dopo await
    const waWindow = window.open("", "_blank");

    try {
      // 1) Genera e carica il PDF su Supabase, ottieni URL pubblico
      const res = await adminFetch("/api/admin/orders/client-confirm-pdf-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: group.orderIds, phone: group.phone, name: group.name }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (waWindow) waWindow.close();
        alert(j.error || "Errore generazione PDF");
        return;
      }

      const pdfUrl: string = j.pdfPublicUrl;

      // 2) Costruisce messaggio — solo emoji semplici, nessun carattere speciale
      const items = getClientItems(group);
      const prodotti = items.filter((i) => i.products !== null);

      const righe: string[] = [];
      for (const it of prodotti) {
        const p = it.products!;
        const price = p.price_eur !== null ? Number(p.price_eur) : null;
        const priceStr = price !== null ? `EUR ${price.toFixed(2)}` : "";
        const qtyStr = it.qty > 1 ? ` x${it.qty}` : "";
        const descrizione = p.specie
          ? p.specie.charAt(0).toUpperCase() + p.specie.slice(1).toLowerCase()
          : `Cassa ${p.box_number}`;
        righe.push(`- ${descrizione}${qtyStr}${priceStr ? `  ${priceStr}` : ""}`);
      }

      const nomeCliente = group.company
        ? `${group.name} (${group.company})`
        : group.name;

      const message =
        `*F.lli D'Andrassi srl*\n\n` +
        `Gentile *${nomeCliente}*,\n` +
        `il tuo ordine e' stato confermato.\n\n` +
        `*Prodotti ordinati:*\n` +
        `${righe.join("\n")}\n\n` +
        `Riepilogo completo:\n` +
        `${pdfUrl}\n\n` +
        `_Grazie e a presto!_\n` +
        `_F.lli D'Andrassi_`;

      // 3) Indirizza la finestra già aperta verso WhatsApp
      const phone = group.phone.replace(/\D/g, "");
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      if (waWindow) waWindow.location.href = waUrl;
    } catch (e: any) {
      if (waWindow) waWindow.close();
      alert(e?.message ?? "Errore rete");
    } finally {
      setClientWaLinkLoading(null);
    }
  }

  // ─── Pulizia ordini ───────────────────────────────────────────────────────
  async function deleteOrdersRange() {
    if (!fromDate || !toDate) { alert("Inserisci sia Da che A (GG/MM/AAAA)"); return; }
    if (!confirm(`Cancellare ordini dal ${fromDate} al ${toDate}?`)) return;
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/delete-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "range", from: fromDate, to: toDate, deletePdfs }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Errore pulizia ordini"); return; }
      alert(`Cancellati: ordini=${json.deletedOrders}, righe=${json.deletedItems}, pdf=${json.deletedPdfs}`);
      setItemsByOrder({});
      setAllItemsLoaded(false);
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  async function deleteOrdersAll() {
    if (!confirm("Cancellare TUTTI gli ordini?")) return;
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/delete-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", deletePdfs }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Errore pulizia ordini"); return; }
      alert(`Cancellati: ordini=${json.deletedOrders}, righe=${json.deletedItems}, pdf=${json.deletedPdfs}`);
      setItemsByOrder({});
      setAllItemsLoaded(false);
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl p-4">

      {/* OVERLAY PDF — schermo intero, compatibile Safari iOS */}
      {pdfBlobUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between bg-white border-b px-4 py-3">
            <button
              className="rounded-lg border px-4 py-2 text-sm font-semibold cursor-pointer"
              onClick={closePdfOverlay}
            >
              ✕ Chiudi
            </button>
            <a
              href={pdfBlobUrl}
              download="preparazione.pdf"
              className="rounded-lg bg-black px-5 py-2 text-sm font-bold text-white"
            >
              ⬇ Scarica PDF
            </a>
          </div>
          <iframe src={pdfBlobUrl} className="flex-1 w-full border-0" title="Stampa preparazione" />
        </div>
      )}

      {/* HEADER */}
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <img src="/logo.jpg" alt="Logo azienda" className="h-20 w-auto" />
        <div className="text-2xl font-bold">Ordini</div>
        <div className="text-sm text-gray-600">Gestisci annulli, ripristina casse e pulisci ordini</div>
      </div>

      {/* BARRA SUPERIORE */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <a className="rounded-lg border bg-white px-4 py-2 font-semibold cursor-pointer" href="/admin">
          ← Torna in Admin
        </a>

        {/* Toggle vista */}
        <div className="flex overflow-hidden rounded-lg border">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold cursor-pointer transition-colors ${viewMode === "orders" ? "bg-black text-white" : "bg-white text-black hover:bg-gray-50"}`}
            onClick={() => setViewMode("orders")}
          >
            Per ordine
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold cursor-pointer transition-colors border-l ${viewMode === "clients" ? "bg-black text-white" : "bg-white text-black hover:bg-gray-50"}`}
            onClick={() => {
              setViewMode("clients");
              if (!allItemsLoaded) loadAllItemsBulk();
            }}
          >
            Per cliente
          </button>
        </div>

        <a
          className="rounded-lg bg-black px-4 py-2 font-semibold text-white cursor-pointer"
          href={`/admin/orders/fulfillment${fromDate && toDate ? `?from=${fromDate}&to=${toDate}` : ""}`}
        >
          📦 Evasione ordini
        </a>

        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60 cursor-pointer"
          disabled={loading}
          onClick={loadOrders}
        >
          Aggiorna
        </button>
      </div>

      {/* BOX PULIZIA */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-bold">Pulizia ordini</div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Da (GG/MM/AAAA)</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">A (GG/MM/AAAA)</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border px-3 py-2"
            />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={deletePdfs} onChange={(e) => setDeletePdfs(e.target.checked)} />
              Cancella anche i PDF
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60 cursor-pointer"
            disabled={loading}
            onClick={() => window.open(`/admin/orders/print?mode=all&type=byOrder`, "_blank")}
          >
            Stampa tutti
          </button>
          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60 cursor-pointer"
            disabled={loading}
            onClick={() => window.open(`/admin/orders/print?mode=all&type=byProduct`, "_blank")}
          >
            Stampa per prodotti
          </button>
          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60 cursor-pointer"
            disabled={loading}
            onClick={() => window.open(`/admin/orders/print?mode=all&type=byCatalog`, "_blank")}
          >
            Stampa per catalogo
          </button>
          <button
            type="button"
            className="rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60 cursor-pointer"
            disabled={loading}
            onClick={deleteOrdersRange}
          >
            Cancella da X a Y
          </button>
          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60 cursor-pointer"
            disabled={loading || !fromDate || !toDate}
            onClick={() => {
              const qs = new URLSearchParams({ from: fromDate, to: toDate });
              const w = window.open("", "_blank");
              (async () => {
                const res = await adminFetch(`/api/admin/orders/prep-pdf-bulk?${qs.toString()}`);
                if (!res.ok) { if (w) w.close(); alert("Errore stampa"); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                if (w) w.location.href = url;
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              })();
            }}
          >
            Stampa preparazione cumulativa
          </button>
          <button
            type="button"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-bold text-red-700 disabled:opacity-60 cursor-pointer"
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

      {/* RICERCA */}
      <div className="mb-4">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Cerca per nome, telefono o azienda…"
          className="w-full rounded-xl border bg-white px-4 py-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-black/20"
        />
        {searchQuery && (
          <div className="mt-1 text-xs text-gray-500">
            {viewMode === "orders"
              ? `${filteredOrders.length} di ${orders.length} ordini`
              : `${filteredClientGroups.length} di ${clientGroups.length} clienti`}
          </div>
        )}
      </div>

      {msg && <div className="mb-3 text-sm">{msg}</div>}

      {/* ══════════════════════════════════════════════════════
          VISTA PER ORDINE (esistente)
      ══════════════════════════════════════════════════════ */}
      {viewMode === "orders" && (
        <div className="grid gap-3">
          {filteredOrders.map((o) => (
            <div key={o.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-base font-bold">
                    {o.customer_name}{customerByPhone[o.customer_phone]?.company ? ` (${customerByPhone[o.customer_phone]?.company})` : ""} — {o.customer_phone}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    {new Date(o.created_at).toLocaleString("it-IT")} • Stato: <b>{o.status}</b> • WA: <b>{o.wa_status ?? "—"}</b> • Ordine:{" "}
                    <span className="font-mono">{o.id.slice(0, 8)}…</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60 cursor-pointer"
                    disabled={loading}
                    onClick={() => loadItems(o.id)}
                  >
                    Mostra casse
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-1 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 cursor-pointer"
                    disabled={loading}
                    onClick={() => {
                      (async () => {
                        const res = await adminFetch(`/api/admin/orders/prep-pdf?orderId=${o.id}`);
                        if (!res.ok) { alert("Errore stampa"); return; }
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        setPdfBlobUrl(url);
                      })();
                    }}
                  >
                    🖨️ Stampa preparazione
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60 cursor-pointer"
                    disabled={loading}
                    onClick={() => resendWhatsApp(o.id)}
                  >
                    Reinvia WhatsApp (PDF aggiornato)
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 disabled:opacity-60 cursor-pointer"
                    disabled={loading || o.wa_status === "sent"}
                    onClick={() => retryWhatsApp(o.id)}
                  >
                    Riprova WhatsApp
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-60 cursor-pointer"
                    disabled={loading || o.wa_status === "sent"}
                    onClick={() => markWhatsAppSent(o.id)}
                  >
                    Segna inviato
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-60 cursor-pointer"
                    disabled={loading}
                    onClick={() => cancelOrder(o.id)}
                  >
                    Annulla ordine
                  </button>
                </div>
              </div>

              {expandedOrders.has(o.id) && (itemsByOrder[o.id] || []).length > 0 && (
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
                        <div className="mt-2">
                          <button
                            type="button"
                            className="w-full rounded-lg bg-black px-3 py-2 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
                            disabled={loading}
                            onClick={() => removeFromOrder(o.id, p.id)}
                          >
                            Rimuovi dall'ordine
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
      )}

      {/* ══════════════════════════════════════════════════════
          VISTA PER CLIENTE (nuova)
      ══════════════════════════════════════════════════════ */}
      {viewMode === "clients" && (
        <div className="grid gap-3">
          {loading && !allItemsLoaded && (
            <div className="text-center text-sm text-gray-500 py-6">⏳ Caricamento casse in corso…</div>
          )}

          {filteredClientGroups.map((group) => {
            const items = getClientItems(group);
            const isWaLoading = clientWaLoading === group.key;
            const isPdfLoading = clientPdfLoading === group.key;
            const totalCasse = items.filter((it) => it.products !== null).length;

            return (
              <div key={group.key} className="rounded-2xl border bg-white p-4 shadow-sm">
                {/* Intestazione cliente */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-base font-bold">
                      {group.name}
                      {group.company ? ` (${group.company})` : ""}
                      {" — "}
                      {group.phone}
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      {group.orderIds.length} {group.orderIds.length === 1 ? "ordine" : "ordini"}
                      {allItemsLoaded ? ` • ${totalCasse} casse` : ""}
                      {" • Ultimo: "}{new Date(group.latestAt).toLocaleString("it-IT")}
                    </div>
                  </div>

                  {/* Azioni per cliente */}
                  <div className="flex flex-wrap gap-2">
                      {!allItemsLoaded ? (
                      <button
                        type="button"
                        className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60 cursor-pointer"
                        disabled={loading}
                        onClick={loadAllItemsBulk}
                      >
                        Carica casse
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-gray-50"
                        onClick={() =>
                          setExpandedClients((prev) => {
                            const next = new Set(prev);
                            if (next.has(group.key)) next.delete(group.key);
                            else next.add(group.key);
                            return next;
                          })
                        }
                      >
                        {expandedClients.has(group.key) ? "Nascondi casse" : "Mostra casse"}
                      </button>
                    )}

                    <button
                      type="button"
                      className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60 cursor-pointer hover:bg-gray-50"
                      disabled={isPdfLoading || loading}
                      onClick={() => printClientPrep(group)}
                    >
                      {isPdfLoading ? "⏳ Generando…" : "🖨️ Stampa preparazione"}
                    </button>

                    <button
                      type="button"
                      className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-bold text-green-800 disabled:opacity-60 cursor-pointer"
                      disabled={isWaLoading || loading}
                      onClick={() => sendClientWhatsApp(group)}
                      title="Invia al titolare il PDF di preparazione (uso interno)"
                    >
                      {isWaLoading ? "⏳ Invio…" : "📲 WA interno"}
                    </button>

                    <button
                      type="button"
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 disabled:opacity-60 cursor-pointer"
                      disabled={clientConfirmWaLoading === group.key || loading}
                      onClick={() => sendClientConfirmWhatsApp(group)}
                      title="Invia via Twilio (numero master)"
                    >
                      {clientConfirmWaLoading === group.key ? "⏳ Invio…" : "📲 WA cliente (Twilio)"}
                    </button>

                    <button
                      type="button"
                      className="rounded-lg bg-green-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-60 cursor-pointer hover:bg-green-600"
                      disabled={clientWaLinkLoading === group.key || loading}
                      onClick={() => openWaClienteLink(group)}
                      title="Apre WhatsApp con messaggio e PDF già pronti — premi solo Invia"
                    >
                      {clientWaLinkLoading === group.key ? "⏳ Preparando…" : "💬 WhatsApp diretto"}
                    </button>

                    <button
                      type="button"
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-60 cursor-pointer"
                      disabled={loading}
                      onClick={() => cancelAllForClient(group)}
                    >
                      🗑 Annulla tutti
                    </button>
                  </div>
                </div>

                {/* Griglia casse del cliente — visibile solo se espanso */}
                {allItemsLoaded && expandedClients.has(group.key) && items.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((it, idx) => {
                      const p = it.products;
                      if (!p) return null;
                      const imgUrl = `${base}/storage/v1/object/public/catalog-images/${p.image_path}`;
                      // order_id è disponibile se caricato via loadAllItemsBulk o loadItems aggiornato
                      const itemOrderId = (it as any).order_id as string | undefined;
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
                          {itemOrderId && (
                            <div className="mt-2">
                              <button
                                type="button"
                                className="w-full rounded-lg bg-black px-3 py-2 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
                                disabled={loading}
                                onClick={() => removeFromOrder(itemOrderId, p.id)}
                              >
                                Rimuovi dall'ordine
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {allItemsLoaded && expandedClients.has(group.key) && items.length === 0 && (
                  <div className="mt-3 text-xs text-gray-400 italic">Nessuna cassa per questo cliente.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
