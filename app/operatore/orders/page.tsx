"use client";

import { useEffect, useMemo, useState } from "react";
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
    weight_kg?: number | null;
    peso_interno_kg?: number | null;
    numero_interno_cassa?: string | null;
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

const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const imgUrl = (path?: string | null) => {
  if (!path) return "";
  const v = String(path);
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `${base}/storage/v1/object/public/catalog-images/${v}`;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function eur(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `€ ${v.toFixed(2)}`;
}

export default function OperatoreOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [customerByPhone, setCustomerByPhone] = useState<Record<string, { company?: string | null }>>({});

  // Vista
  const [viewMode, setViewMode] = useState<"orders" | "clients">("orders");
  const [allItemsLoaded, setAllItemsLoaded] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Filtri data per stampa
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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
        .select("id,catalog_id,customer_name,customer_phone,status,created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) { setMsg("Errore caricando ordini: " + error.message); return; }

      setOrders((data || []) as any);
      setExpandedOrders(new Set());
      setExpandedClients(new Set());

      try {
        const phones = Array.from(
          new Set((data || []).map((o: any) => String(o.customer_phone || "").trim()).filter(Boolean))
        );
        if (!phones.length) {
          setCustomerByPhone({});
        } else {
          const session = (await supabaseBrowser().auth.getSession()).data.session;
          const token = session?.access_token;
          const map: Record<string, { company?: string | null }> = {};
          if (token) {
            const res = await fetch("/api/shared/companies", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify({ phones }),
            });
            if (res.ok) {
              const json = await res.json();
              for (const [ph, co] of Object.entries(json.companies || {})) {
                map[ph] = { company: co as string | null };
              }
            }
          }
          setCustomerByPhone(map);
        }
      } catch { setCustomerByPhone({}); }

      setMsg(`✅ ${(data || []).length} ordini caricati`);
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
        .select("order_id, qty, products(id, progressive_number, box_number, image_path, is_sold, price_eur, specie, weight_kg, peso_interno_kg, numero_interno_cassa)")
        .eq("order_id", orderId);
      if (error) { alert(error.message); return; }
      setItemsByOrder((prev) => ({ ...prev, [orderId]: (data || []) as any }));
      setExpandedOrders((prev) => new Set([...prev, orderId]));
    } finally {
      setLoading(false);
    }
  }

  // ─── Carica TUTTI gli items in bulk ────────────────────────────────────
  async function loadAllItemsBulk() {
    if (!orders.length) return;
    setLoading(true);
    setMsg("Caricamento casse in corso…");
    try {
      const { data, error } = await supabaseBrowser()
        .from("order_items")
        .select("order_id, qty, products(id, progressive_number, box_number, image_path, is_sold, price_eur, specie, weight_kg, peso_interno_kg, numero_interno_cassa)")
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

  useEffect(() => { loadOrders(); }, []);

  // Quando si passa a vista clienti, carica tutti gli items
  useEffect(() => {
    if (viewMode === "clients" && !allItemsLoaded && orders.length > 0) {
      loadAllItemsBulk();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // ─── URL stampa ──────────────────────────────────────────────────────────
  function printUrl(params: Record<string, string>) {
    const sp = new URLSearchParams(params);
    return `/operatore/orders/print?${sp.toString()}`;
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ordini</h1>
          <p className="text-sm text-gray-500 mt-1">Visualizza e stampa gli ordini</p>
        </div>
        <button
          onClick={loadOrders}
          disabled={loading}
          className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {loading ? "Caricamento…" : "↻ Aggiorna"}
        </button>
      </div>

      {msg && (
        <div className="rounded-lg border bg-white px-4 py-2 text-sm text-gray-600">
          {msg}
        </div>
      )}

      {/* Stampa range per data */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-gray-700 mb-3">🖨️ Stampa per intervallo date</div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Dal</label>
            <input
              type="date"
              className="rounded-lg border px-3 py-2 text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Al</label>
            <input
              type="date"
              className="rounded-lg border px-3 py-2 text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <a
            href={fromDate && toDate ? printUrl({ type: "byClient", mode: "range", from: fromDate, to: toDate, layout: "simple" }) : "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              fromDate && toDate
                ? "bg-gray-700 text-white hover:bg-gray-800"
                : "bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none"
            }`}
          >
            Cumulativa (senza foto)
          </a>
          <a
            href={fromDate && toDate ? printUrl({ type: "byClient", mode: "range", from: fromDate, to: toDate, layout: "detailed" }) : "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              fromDate && toDate
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none"
            }`}
          >
            Preparazione (con foto)
          </a>
        </div>
      </div>

      {/* Vista toggle + Ricerca */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border bg-white overflow-hidden">
          <button
            onClick={() => setViewMode("orders")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === "orders" ? "bg-black text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Per ordine
          </button>
          <button
            onClick={() => setViewMode("clients")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === "clients" ? "bg-black text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Per cliente
          </button>
        </div>

        <input
          type="search"
          placeholder="Cerca nome, telefono, azienda…"
          className="rounded-lg border px-3 py-2 text-sm min-w-[200px]"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* ─── VISTA PER ORDINE ─────────────────────────────────────── */}
      {viewMode === "orders" && (
        <div className="space-y-3">
          {filteredOrders.length === 0 && !loading && (
            <div className="rounded-xl border bg-white p-6 text-center text-sm text-gray-500">
              {orders.length === 0 ? "Nessun ordine." : "Nessun risultato per la ricerca."}
            </div>
          )}

          {filteredOrders.map((order) => {
            const company = customerByPhone[String(order.customer_phone).trim()]?.company;
            const isExpanded = expandedOrders.has(order.id);
            const items = itemsByOrder[order.id] || [];

            return (
              <div key={order.id} className="rounded-xl border bg-white shadow-sm overflow-hidden">
                {/* Header ordine */}
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">
                      {order.customer_name}
                      {company && <span className="ml-2 text-xs text-gray-500 font-normal">({company})</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      📞 {order.customer_phone} · {fmtDate(order.created_at)}
                    </div>
                    <div className="mt-1">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        order.status === "confirmed"
                          ? "bg-green-100 text-green-700"
                          : order.status === "cancelled"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>

                  {/* Azioni: solo visualizza e stampa */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedOrders((prev) => { const s = new Set(prev); s.delete(order.id); return s; });
                        } else {
                          loadItems(order.id);
                        }
                      }}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 transition-colors"
                    >
                      {isExpanded ? "▲ Nascondi casse" : "▼ Vedi casse"}
                    </button>

                    <a
                      href={printUrl({ type: "byOrder", mode: "single", orderId: order.id })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                    >
                      🖨️ Stampa
                    </a>
                  </div>
                </div>

                {/* Casse espanse */}
                {isExpanded && items.length > 0 && (
                  <div className="border-t bg-gray-50 p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {items.map((item, idx) => {
                        const p = item.products;
                        if (!p) return null;
                        return (
                          <div key={`${p.id}-${idx}`} className="rounded-lg border bg-white p-2 shadow-sm">
                            {p.image_path && (
                              <img
                                src={imgUrl(p.image_path)}
                                alt={p.box_number || ""}
                                className="mb-2 h-20 w-full object-cover rounded"
                              />
                            )}
                            <div className="text-xs font-bold">Cassa {p.box_number}</div>
                            {p.numero_interno_cassa && (
                              <div className="mt-0.5">
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                                  N° coop: {p.numero_interno_cassa}
                                </span>
                              </div>
                            )}
                            {p.specie && (
                              <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-800">{p.specie}</div>
                            )}
                            <div className="mt-0.5 space-y-0.5">
                              {p.peso_interno_kg != null && (
                                <div className="text-xs text-gray-500">int. {Number(p.peso_interno_kg).toFixed(2)} kg</div>
                              )}
                              {p.weight_kg != null && (
                                <div className="text-xs text-gray-500">pub. {Number(p.weight_kg).toFixed(2)} kg</div>
                              )}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-blue-700">{eur(p.price_eur)}</div>
                            {item.qty > 1 && (
                              <div className="text-xs text-gray-400">×{item.qty}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {isExpanded && items.length === 0 && (
                  <div className="border-t bg-gray-50 p-4 text-center text-xs text-gray-400">
                    Nessuna cassa trovata.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── VISTA PER CLIENTE ────────────────────────────────────── */}
      {viewMode === "clients" && (
        <div className="space-y-3">
          {!allItemsLoaded && (
            <div className="rounded-xl border bg-white p-4 text-center text-sm text-gray-500">
              Caricamento casse in corso…
            </div>
          )}

          {allItemsLoaded && filteredClientGroups.length === 0 && (
            <div className="rounded-xl border bg-white p-6 text-center text-sm text-gray-500">
              Nessun cliente trovato.
            </div>
          )}

          {filteredClientGroups.map((group) => {
            const items = getClientItems(group);
            const isExpanded = expandedClients.has(group.key);

            return (
              <div key={group.key} className="rounded-xl border bg-white shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">
                      {group.name}
                      {group.company && (
                        <span className="ml-2 text-xs text-gray-500 font-normal">({group.company})</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      📞 {group.phone} · {group.orderIds.length} ordine/i · {items.length} casse
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        setExpandedClients((prev) => {
                          const s = new Set(prev);
                          if (s.has(group.key)) s.delete(group.key);
                          else s.add(group.key);
                          return s;
                        });
                      }}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 transition-colors"
                    >
                      {isExpanded ? "▲ Nascondi" : "▼ Vedi casse"}
                    </button>

                    <a
                      href={printUrl({
                        type: "byClient",
                        mode: "single",
                        phone: group.phone,
                        name: group.name,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
                    >
                      🖨️ Stampa cliente
                    </a>
                  </div>
                </div>

                {isExpanded && items.length > 0 && (
                  <div className="border-t bg-gray-50 p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {items.map((item, idx) => {
                        const p = item.products;
                        if (!p) return null;
                        return (
                          <div key={`${p.id}-${idx}`} className="rounded-lg border bg-white p-2 shadow-sm">
                            {p.image_path && (
                              <img
                                src={imgUrl(p.image_path)}
                                alt={p.box_number || ""}
                                className="mb-2 h-20 w-full object-cover rounded"
                              />
                            )}
                            <div className="text-xs font-bold">Cassa {p.box_number}</div>
                            {p.numero_interno_cassa && (
                              <div className="mt-0.5">
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                                  N° coop: {p.numero_interno_cassa}
                                </span>
                              </div>
                            )}
                            {p.specie && (
                              <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-800">{p.specie}</div>
                            )}
                            <div className="mt-0.5 space-y-0.5">
                              {p.peso_interno_kg != null && (
                                <div className="text-xs text-gray-500">int. {Number(p.peso_interno_kg).toFixed(2)} kg</div>
                              )}
                              {p.weight_kg != null && (
                                <div className="text-xs text-gray-500">pub. {Number(p.weight_kg).toFixed(2)} kg</div>
                              )}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-blue-700">{eur(p.price_eur)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {isExpanded && items.length === 0 && (
                  <div className="border-t bg-gray-50 p-4 text-center text-xs text-gray-400">
                    Nessuna cassa trovata.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
