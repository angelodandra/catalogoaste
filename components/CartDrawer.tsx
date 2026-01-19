"use client";

import type { ProductUI } from "./Grid3x3";

export type CartItem = { product: ProductUI; qty: number };

export function CartDrawer(props: {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  onCheckout: () => void;
}) {
  if (!props.open) return null;

  const count = props.items.reduce((a, b) => a + b.qty, 0);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold">Carrello ({count})</div>
          <button className="rounded-md border px-3 py-1" onClick={props.onClose}>
            Chiudi
          </button>
        </div>

        <div className="mt-4 space-y-3 overflow-auto" style={{ maxHeight: "75vh" }}>
          {props.items.length === 0 && <div className="text-sm text-gray-600">Vuoto</div>}

          {props.items.map((it) => (
            <div key={it.product.id} className="flex gap-3 rounded-lg border p-2">
              <img src={it.product.image_url} className="h-16 w-16 rounded object-cover" />
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  Prog {it.product.progressive_number} — Cassa {it.product.box_number}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="rounded-md border px-2"
                    onClick={() => props.setQty(it.product.id, Math.max(1, it.qty - 1))}
                  >
                    -
                  </button>
                  <div className="w-8 text-center">{it.qty}</div>
                  <button className="rounded-md border px-2" onClick={() => props.setQty(it.product.id, it.qty + 1)}>
                    +
                  </button>

                  <button
                    className="ml-auto rounded-md border px-2 py-1 text-sm"
                    onClick={() => props.remove(it.product.id)}
                  >
                    Rimuovi
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="mt-4 w-full rounded-lg bg-black px-4 py-3 text-white disabled:opacity-50"
          disabled={props.items.length === 0}
          onClick={props.onCheckout}
        >
          Vai al checkout
        </button>
      </div>
    </div>
  );
}
