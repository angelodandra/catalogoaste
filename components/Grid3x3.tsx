"use client";

export type ProductUI = {
  id: string;
  progressive_number: number;
  box_number: string;
  image_url: string;
  is_sold: boolean;
  price_eur?: number | null;
};

export function Grid3x3(props: { products: ProductUI[]; onAdd: (p: ProductUI) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {props.products.map((p) => (
        <div key={p.id} className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="relative">
            <img src={p.image_url} className="h-56 w-full rounded-xl object-cover" />

            {/* Numero progressivo */}
            <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white">
              {p.progressive_number}
            </div>

            {/* Cassa */}
            <div className="absolute left-2 bottom-2 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold">
              Cassa {p.box_number}
            </div>

            {/* Prezzo */}
            {p.price_eur !== undefined && p.price_eur !== null && (
              <div className="absolute right-2 bottom-2 rounded-md bg-black/80 px-2 py-1 text-xs font-bold text-white">
                € {Number(p.price_eur).toFixed(2)}
              </div>
            )}

            {/* Esaurito */}
            {p.is_sold && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55">
                <div className="rounded-lg bg-white px-3 py-2 text-sm font-bold">ESAURITO</div>
              </div>
            )}
          </div>

          <button
            className="mt-3 w-full rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={p.is_sold}
            onClick={() => props.onAdd(p)}
          >
            Aggiungi
          </button>
        </div>
      ))}
    </div>
  );
}
