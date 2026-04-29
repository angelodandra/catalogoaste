"use client";

import { use, useEffect, useMemo, useState } from "react";
import type { ProductUI } from "@/components/Grid3x3";
import { useRouter } from "next/navigation";
type CartItem = { product: ProductUI; qty: number };
type SoldItem = { productId: string; label: string };

export default function CheckoutPage(props: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = use(props.params);
  const router = useRouter();

  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  const [customer, setCustomer] = useState<any>(null);
  const [isSeller, setIsSeller] = useState(false);
  const [manualName, setManualName] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [msgType, setMsgType] = useState<"ok" | "warn" | "error">("ok");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Stato avviso disponibilità (fase 1)
  const [soldItems, setSoldItems] = useState<SoldItem[]>([]);
  const [showSoldWarning, setShowSoldWarning] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`cart:${catalogId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setItems(parsed);
    } catch {
      setItems([]);
    } finally {
      setReady(true);
    }
  }, [catalogId]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { credentials: "include" });
        if (r.status === 401) {
          window.location.href = `/auth?next=/checkout/${catalogId}`;
          return;
        }
        const j = await r.json();
        if (r.ok && j?.customer) {
          setCustomer(j.customer);
          if ((j.customer.name || "").toLowerCase().includes("venditore")) setIsSeller(true);
        }
      } catch {}
    })();
  }, []);

  const total = useMemo(() => {
    let t = 0;
    for (const it of items) {
      const price = it.product.price_eur ?? null;
      if (price !== null && price !== undefined) t += Number(price) * Number(it.qty ?? 1);
    }
    return t;
  }, [items]);

  // FASE 1: controlla disponibilità prima di inviare
  async function handleCheckout() {
    setMsg("");
    setMsgType("ok");
    setSoldItems([]);
    setShowSoldWarning(false);

    if (!items.length) {
      setMsg("Carrello vuoto.");
      setMsgType("error");
      return;
    }

    if (isSeller && !manualName.trim()) {
      setMsg("Inserisci nome cliente");
      setMsgType("error");
      return;
    }

    setLoading(true);
    try {
      const productIds = items.map((it) => it.product.id);
      const res = await fetch("/api/checkout/check-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds }),
      });
      const json = await res.json();

      if (!res.ok) {
        setMsg("Errore nella verifica disponibilità. Riprova.");
        setMsgType("error");
        return;
      }

      const sold: SoldItem[] = json.sold || [];

      if (sold.length === productIds.length) {
        // Tutti esauriti
        setMsg(
          `⚠️ Tutti i prodotti nel carrello non sono più disponibili:\n${sold.map((s) => s.label).join(", ")}\n\nRitorna al catalogo per scegliere altri prodotti.`
        );
        setMsgType("error");
        return;
      }

      if (sold.length > 0) {
        // Alcuni esauriti → mostra avviso e aspetta conferma
        setSoldItems(sold);
        setShowSoldWarning(true);
        return;
      }

      // Tutto disponibile → procedi direttamente
      await placeOrder();
    } finally {
      setLoading(false);
    }
  }

  // FASE 2: invia effettivamente l'ordine
  async function placeOrder() {
    setShowSoldWarning(false);
    setLoading(true);
    try {
      const payload = {
        catalogId,
        items: items.map((it) => ({ productId: it.product.id, qty: it.qty })),
        customerName: isSeller ? manualName : undefined,
      };

      const res = await fetch("/api/checkout/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        const skippedMsg = json.skipped?.length
          ? `\nProdotti non disponibili: ${json.skipped.map((s: any) => s.label).join(", ")}`
          : "";
        setMsg((json.error || "Errore invio ordine") + skippedMsg);
        setMsgType("error");
        return;
      }

      // Svuota carrello
      localStorage.removeItem(`cart:${catalogId}`);
      setItems([]);

      // Messaggio finale
      let okMsg = "Ordine inviato ✅";
      if (json.pdfPublicUrl) {
        setPdfUrl(String(json.pdfPublicUrl));
        okMsg = "Ordine inviato ✅ — PDF pronto";
      } else {
        setPdfUrl(null);
      }

      const skippedIds: string[] = (json.skipped || []).map((s: any) => s.productId);
      if (skippedIds.length > 0) {
        const skippedLabels = (json.skipped as any[]).map((s) => s.label).join(", ");
        setMsg(`${okMsg}\n\n⚠️ I seguenti prodotti erano già esauriti e non sono stati inclusi:\n${skippedLabels}`);
        setMsgType("warn");
      } else {
        setMsg(okMsg);
        setMsgType("ok");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-6 flex justify-center">
        <img src="/logo.jpg" alt="Logo azienda" className="h-20 w-auto" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Conferma ordine</h1>
        <button
          className="rounded-lg border bg-white px-4 py-2 font-semibold"
          onClick={() => router.push(`/catalog/${catalogId}`)}
        >
          ← Torna al catalogo
        </button>
      </div>

      {!ready ? (
        <div className="mt-4 text-sm text-gray-600">Caricamento…</div>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold">Cliente</div>
            <div className="mt-2 text-sm text-gray-700">
              {isSeller ? (
                <div className="mt-2">
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="Nome cliente finale"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                </div>
              ) : customer ? (
                <>
                  <div><b>{customer.name}</b> {customer.company ? `(${customer.company})` : ""}</div>
                  <div className="font-mono">{customer.phone}</div>
                </>
              ) : (
                <div className="text-gray-600">Caricamento dati cliente…</div>
              )}
            </div>
          </div>

          {/* Banner avviso prodotti esauriti (fase 1) */}
          {showSoldWarning && (
            <div className="mt-4 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4 shadow-sm">
              <div className="text-base font-bold text-orange-800">
                ⚠️ Alcuni prodotti non sono più disponibili
              </div>
              <div className="mt-2 text-sm text-orange-700">
                I seguenti prodotti sono stati acquistati da un altro cliente:
              </div>
              <ul className="mt-2 space-y-1">
                {soldItems.map((s) => (
                  <li key={s.productId} className="flex items-center gap-2 text-sm font-semibold text-orange-900">
                    <span className="text-orange-500">✕</span> {s.label}
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-sm text-orange-800">
                Vuoi procedere con i prodotti rimanenti, o tornare al catalogo per trovare un sostituto?
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  className="flex-1 rounded-xl bg-black px-4 py-3 font-bold text-white"
                  onClick={placeOrder}
                  disabled={loading}
                >
                  {loading ? "Invio…" : "Procedi con i prodotti rimanenti"}
                </button>
                <button
                  className="flex-1 rounded-xl border-2 border-orange-400 bg-white px-4 py-3 font-bold text-orange-800"
                  onClick={() => router.push(`/catalog/${catalogId}`)}
                >
                  ← Torna al catalogo
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Riepilogo</div>
              {/* Nessun totale: il valore finale viene calcolato in fattura
                  in base al peso effettivo alla consegna. */}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {items.map((it) => {
                const isSold = soldItems.some((s) => s.productId === it.product.id);
                return (
                  <div
                    key={it.product.id}
                    className={`rounded-xl border p-3 ${isSold ? "bg-red-50 opacity-60 border-red-200" : "bg-gray-50"}`}
                  >
                    {isSold && (
                      <div className="mb-1 text-xs font-bold text-red-600">✕ Non disponibile</div>
                    )}
                    <div className="flex gap-3">
                      <img src={it.product.image_url} className="h-20 w-20 rounded object-cover" />
                      <div className="flex-1">
                        <div className="text-sm font-bold">
                          Cassa {it.product.box_number} — Prog {it.product.progressive_number}
                        </div>
                        <div className="mt-1 text-sm">
                          Prezzo:{" "}
                          {it.product.price_eur !== null && it.product.price_eur !== undefined
                            ? `€ ${Number(it.product.price_eur).toFixed(2)} /Kg`
                            : "—"}
                        </div>
                        <div className="mt-1 text-sm">
                          Peso:{" "}
                          {it.product.weight_kg !== null && it.product.weight_kg !== undefined
                            ? `≈ ${Number(it.product.weight_kg).toFixed(2)} kg`
                            : "—"}
                        </div>
                        <div className="mt-1 text-sm">Quantità: {it.qty}</div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {items.length === 0 && <div className="text-sm text-gray-600">Carrello vuoto.</div>}
            </div>

            {!showSoldWarning && (
              <button
                className="mt-4 w-full rounded-xl bg-black px-4 py-3 font-bold text-white disabled:opacity-60"
                disabled={loading || items.length === 0}
                onClick={handleCheckout}
              >
                {loading ? "Verifica disponibilità…" : "Conferma ordine"}
              </button>
            )}

            {msg && (
              <div className={`mt-3 whitespace-pre-line rounded-xl px-4 py-3 text-sm font-medium
                ${msgType === "ok" ? "bg-green-50 text-green-800"
                  : msgType === "warn" ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
                  : "bg-red-50 text-red-700"}`}>
                {msg}
              </div>
            )}

            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
              >
                Apri PDF
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
