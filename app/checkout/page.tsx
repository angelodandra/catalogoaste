"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  box_number: string;
  progressive_number: number;
  image_url: string;
  price_eur?: number | null;
  weight_kg?: number | null;
};

type CartItem = { product: Product; qty: number };

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  const [customerName, setCustomerName] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cart:global");
      const parsed = raw ? JSON.parse(raw) : [];
      setItems(parsed);
    } catch {
      setItems([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { credentials: "include" });
        if (r.status === 401) {
          window.location.href = `/auth?next=/checkout`;
          return;
        }
        const j = await r.json();
        if (r.ok && j?.customer) {
          setCustomer(j.customer);
          if ((j.customer.role || "").toLowerCase() === "seller") {
            setCustomerName("");
          }
        }
      } catch {}
    })();
  }, []);

  const isSeller = (customer?.role || "").toLowerCase() === "seller";

  const total = useMemo(() => {
    let t = 0;
    for (const it of items) {
      const price = it.product.price_eur ?? null;
      if (price !== null && price !== undefined) {
        t += Number(price) * Number(it.qty ?? 1);
      }
    }
    return t;
  }, [items]);

  async function submit() {
    setMsg("");

    if (!items.length) {
      setMsg("Carrello vuoto");
      return;
    }

    if (isSeller && !customerName.trim()) {
      setMsg("Inserisci nome cliente");
      return;
    }

    setLoading(true);

    try {
      const firstCatalogId = (items[0] && (items[0].product as any).catalog_id) || null;

      const res = await fetch("/api/checkout/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogId: firstCatalogId,
          items: items.map((it) => ({
            productId: it.product.id,
            qty: it.qty,
          })),
          customerName: isSeller ? customerName : undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMsg(json.error || "Errore ordine");
        return;
      }

      localStorage.removeItem("cart:global");
      setItems([]);

      setMsg("Ordine inviato ✅");

    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-6 flex justify-center">
        <img src="/logo.jpg" className="h-20 w-auto" />
      </div>

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Conferma ordine</h1>
        <button onClick={() => router.push("/catalog")} className="border px-3 py-2 rounded">
          ← Torna
        </button>
      </div>

      {isSeller && (
        <div className="mt-4">
          <input
            className="w-full border px-3 py-2 rounded"
            placeholder="Nome cliente"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {items.map((it) => (
          <div key={it.product.id} className="border p-3 rounded">
            <div className="flex gap-3">
              <img src={it.product.image_url} className="h-20 w-20 object-cover rounded" />
              <div>
                <div className="font-bold">
                  Prog {it.product.progressive_number}
                </div>
                <div>Prezzo: € {Number(it.product.price_eur || 0).toFixed(2)} /Kg</div>
                <div>Qtà: {it.qty}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        className="mt-4 w-full bg-black text-white py-3 rounded"
        onClick={submit}
        disabled={loading}
      >
        {loading ? "Invio..." : "Conferma ordine"}
      </button>

      {msg && <div className="mt-3 text-sm">{msg}</div>}
    </div>
  );
}
