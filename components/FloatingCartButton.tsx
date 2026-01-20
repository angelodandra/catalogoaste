"use client";

export default function FloatingCartButton(props: { count: number; onOpen: () => void }) {
  const { count, onOpen } = props;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="sm:hidden fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-black px-4 py-3 text-white shadow-lg"
      aria-label="Apri carrello"
    >
      <span className="text-lg">🛒</span>
      <span className="text-sm font-bold">Carrello</span>

      <span className="ml-1 inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-white px-2 text-xs font-extrabold text-black">
        {count}
      </span>
    </button>
  );
}
