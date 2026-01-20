"use client";

import type { ProductUI } from "./Grid3x3";

export default function CartDrawer(props: any) {
  const open: boolean = !!props.open;
  const items: ProductUI[] = Array.isArray(props.items) ? props.items : [];
  const onClose: () => void = typeof props.onClose === "function" ? props.onClose : () => {};
  const onRemove: (id: string) => void =
    typeof props.onRemove === "function" ? props.onRemove : () => {};
  const onCheckout: () => void =
    typeof props.onCheckout === "function" ? props.onCheckout : () => {};

  // sicurezza: niente duplicati (casse singole)
  const uniqueMap = new Map<string, ProductUI>();
  for (const p of items) {
    const id = (p as any)?.id ? String((p as any).id) : "";
    if (!id) continue;
    if (!uniqueMap.has(id)) uniqueMap.set(id, p);
  }
  const unique = Array.from(uniqueMap.values());

  const total = unique.reduce((acc, p) => acc + (Number(p.price_eur) || 0), 0);
  const count = unique.length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <div className="text-lg font-bold">Carrello</div>
            <div className="text-sm text-gray-600">
              {count} {count === 1 ? "cassa" : "casse"}
              {total > 0 ? ` • Totale € ${total.toFixed(2)}` : ""}
            </div>
          </div>

          <button className="rounded-lg border px-3 py-2 text-sm font-semibold" onClick={onClose}>
            Chiudi
          </button>
        </div>

        <div className="p-4">
          {count === 0 ? (
            <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
              Carrello vuoto.
            </div>
          ) : (
            <div className="space-y-3">
              {unique.map((p) => (
                <div key={p.id + ":" + p.box_number + ":" + p.progressive_number} className="flex gap-3 rounded-2xl border p-3">
                  <img
                    src={p.image_url}
                    className="h-16 w-20 rounded-xl border object-contain bg-white"
                    alt=""
                  />

                  <div className="flex-1">
                    <div className="text-sm font-bold">
                      Cassa {p.box_number} • Prog {p.progressive_number}
                    </div>
                    <div className="mt-1 text-sm text-gray-700">
                      {p.price_eur !== null && p.price_eur !== undefined
                        ? `€ ${Number(p.price_eur).toFixed(2)}`
                        : "Prezzo: —"}
                    </div>
                  </div>

                  <button
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
                    onClick={() => onRemove(p.id)}
                  >
                    Rimuovi
                  </button>
                </div>
              ))}

              <button
                className="mt-2 w-full rounded-lg bg-black px-4 py-3 text-base font-bold text-white"
                onClick={onCheckout}
              >
                Checkout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
