"use client";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (n: number) => void;
};

export default function PaginationBar({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  const cream = "#F7F3E8";
  const cream2 = "#EFE9D6";
  const cream3 = "#E6DFC8";
  const cream4 = "#FBF9F2";

  return (
    <div style={{ backgroundColor: cream }} className="mt-6 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <button
          style={{ backgroundColor: cream2 }}
          className="rounded-lg border border-black/30 px-4 py-2 text-sm font-bold text-black disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          ←
        </button>

        <div className="flex flex-1 items-center justify-center gap-2 overflow-x-auto">
          {Array.from({ length: totalPages }).map((_, i) => {
            const n = i + 1;
            const active = n === page;
            return (
              <button
                key={n}
                onClick={() => onPageChange(n)}
                style={{
                  backgroundColor: active ? cream3 : cream4,
                  borderColor: active ? "#000" : "rgba(0,0,0,0.3)",
                }}
                className="min-w-[40px] rounded-lg border px-4 py-2 text-sm font-bold text-black"
              >
                {n}
              </button>
            );
          })}
        </div>

        <button
          style={{ backgroundColor: cream2 }}
          className="rounded-lg border border-black/30 px-4 py-2 text-sm font-bold text-black disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          →
        </button>
      </div>
    </div>
  );
}
