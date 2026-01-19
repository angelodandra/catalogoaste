"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CartItem } from "@/components/CartDrawer";

export default function CheckoutPage(props: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = use(props.params);
  const router = useRouter();

  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

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

  const total = useMemo(() => {
    let t = 0;
    for (const it of items) {
      const price = it.product.price_eur ?? null;
      if (price !== null && price !== undefined) t += Number(price) * Number(it.qty ?? 1);
    }
    return t;
  }, [items]);

  async function submit() {
    setMsg("");
    if (!customerName.trim() || !customerPhone.trim()) {
      setMsg("Inserisci nome e telefono.");
      return;
    }
    if (!items.length) {
      setMsg("Carrello vuoto.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        catalogId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        items: items.map((it) => ({ productId: it.product.id, qty: it.qty })),
      };

      const res = await fetch("/api/checkout/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setMsg(json.error || "Errore invio ordine");
        return;
      }

      // svuota carrello
      localStorage.removeItem(`cart:${catalogId}`);
      setItems([]);

      setMsg("Ordine inviato ✅");

      if (json.pdfPublicUrl) {
        setMsg(`Ordine inviato ✅ — PDF pronto`);
        // apre il pdf in una nuova tab
        window.open(json.pdfPublicUrl, "_blank");
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
        <h1 className="text-2xl font-bold">Checkout</h1>
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
            <div className="text-sm font-semibold">Dati cliente</div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome cliente"
                className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/30"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Telefono (es. +39...)"
                className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/30"
              />
            </div>
          </div>

          <div className="mt-3 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Riepilogo</div>
              <div className="text-sm font-bold">Totale: € {total.toFixed(2)}</div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {items.map((it) => (
                <div key={it.product.id} className="rounded-xl border bg-gray-50 p-3">
                  <div className="flex gap-3">
                    <img src={it.product.image_url} className="h-20 w-20 rounded object-cover" />
                    <div className="flex-1">
                      <div className="text-sm font-bold">
                        Cassa {it.product.box_number} — Prog {it.product.progressive_number}
                      </div>
                      <div className="mt-1 text-sm">
                        Prezzo:{" "}
                        {it.product.price_eur !== null && it.product.price_eur !== undefined
                          ? `€ ${Number(it.product.price_eur).toFixed(2)}`
                          : "—"}
                      </div>
                      <div className="mt-1 text-sm">Quantità: {it.qty}</div>
                    </div>
                  </div>
                </div>
              ))}

              {items.length === 0 && <div className="text-sm text-gray-600">Carrello vuoto.</div>}
            </div>

            <button
              className="mt-4 w-full rounded-xl bg-black px-4 py-3 font-bold text-white disabled:opacity-60"
              disabled={loading || items.length === 0}
              onClick={submit}
            >
              {loading ? "Invio..." : "Conferma ordine"}
            </button>

            {msg && <div className="mt-3 text-sm">{msg}</div>}
          </div>
        </>
      )}
    </div>
  );
}
