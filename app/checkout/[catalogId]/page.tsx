"use client";

import { use, useEffect, useMemo, useState } from "react";
import type { ProductUI } from "@/components/Grid3x3";
import { useRouter } from "next/navigation";
type CartItem = { product: ProductUI; qty: number };

export default function CheckoutPage(props: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = use(props.params);
  const router = useRouter();

  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  const [customer, setCustomer] = useState<any>(null);


  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

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
        const r = await fetch("/api/access/me");
        const j = await r.json();
        if (r.ok && j?.customer) setCustomer(j.customer);
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

  async function submit() {
    setMsg("");
    if (!items.length) {
      setMsg("Carrello vuoto.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        catalogId,
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

      setMsg("Ordine inviato ✅");      if (json.pdfPublicUrl) {
        const url = String(json.pdfPublicUrl);
        setPdfUrl(url);
        setMsg(`Ordine inviato ✅ — PDF pronto`);
        // Tentativo automatico (se il browser lo consente)
        try { window.location.href = url; } catch {}
      } else {
        setPdfUrl(null);
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
              {customer ? (
                <>
                  <div><b>{customer.name}</b> {customer.company ? `(${customer.company})` : ""}</div>
                  <div className="font-mono">{customer.phone}</div>
                </>
              ) : (
                <div className="text-gray-600">Caricamento dati cliente…</div>
              )}
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
