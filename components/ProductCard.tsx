"use client";

export function ProductCard(props: {
  imageUrl: string;
  progressive: number;
  box: string;
  sold: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={props.sold ? undefined : props.onClick}
      disabled={props.sold}
      className="relative w-full rounded-xl border bg-white p-2 text-left shadow-sm disabled:opacity-60"
    >
      <div className="relative">
        <img
          src={props.imageUrl}
          alt={`Prodotto ${props.progressive}`}
          className="h-44 w-full rounded-lg object-cover"
        />

        <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white">
          {props.progressive}
        </div>

        <div className="absolute left-2 bottom-2 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold">
          Cassa {props.box}
        </div>

        {props.sold && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/55">
            <span className="rounded-md bg-white px-3 py-1 text-sm font-bold">ESAURITO</span>
          </div>
        )}
      </div>
    </button>
  );
}
