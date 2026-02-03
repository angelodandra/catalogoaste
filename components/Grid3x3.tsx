"use client";

import { useState } from "react";

export type ProductUI = {
  id: string;
  progressive_number: number;
  box_number: string;
  image_url: string;
  is_sold: boolean;
  price_eur?: number | null;
  weight_kg?: number | null;
};

export function Grid3x3(props: {
  products: ProductUI[];
  onAdd: (p: ProductUI) => void;
  showPrices?: boolean;
  canAdd?: boolean;
}) {
  const showPrices = props.showPrices !== false;
  const canAdd = props.canAdd !== false;

  const [preview, setPreview] = useState<ProductUI | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3 sm:grid-cols-3 lg:grid-cols-3">
        {props.products.map((p) => (
          <div key={p.id} className="rounded-2xl border bg-white p-2 sm:p-3 shadow-sm">
            <div className="relative">
              <button
                type="button"
                className="block w-full"
                onClick={() => setPreview(p)}
                aria-label="Apri foto"
              >
                <img src={p.image_url} className="h-32 sm:h-44 lg:h-56 w-full rounded-xl object-cover" />
              </button>

              <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white">
                {p.progressive_number}
              </div>

              <div className="absolute left-2 bottom-2 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold">
                Cassa {p.box_number}
              </div>

              {showPrices && p.price_eur !== undefined && p.price_eur !== null && (
                <div className="absolute right-2 bottom-2 rounded-md bg-black/80 px-2 py-1 text-xs font-bold text-white">
                  € {Number(p.price_eur).toFixed(2)}
                </div>
              )}

              {p.weight_kg !== undefined && p.weight_kg !== null && (
                <div className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold">
                  ≈ {Number(p.weight_kg).toFixed(2)} kg
                </div>
              )}

              {p.is_sold && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55">
                  <div className="rounded-lg bg-white px-3 py-2 text-sm font-bold">ESAURITO</div>
                </div>
              )}

              {!canAdd && !p.is_sold && (
                <div className="absolute inset-0 flex items-end justify-center rounded-xl bg-black/20 p-2">
                  <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold">🔒 Sblocca per ordinare</div>
                </div>
              )}
            </div>

            <button
              className="mt-3 w-full rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50"
              disabled={p.is_sold || !canAdd}
              onClick={() => props.onAdd(p)}
            >
              Aggiungi
            </button>
          </div>
        ))}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="max-w-3xl w-full">
            <img src={preview.image_url} className="w-full rounded-2xl object-contain bg-white" />
            <div className="mt-2 text-center text-white text-sm">
              Cassa {preview.box_number} • #{preview.progressive_number}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
