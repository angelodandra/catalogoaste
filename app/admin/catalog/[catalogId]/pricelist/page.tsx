"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { adminFetch } from "@/lib/adminFetch";

type CatalogInfo = { title?: string | null; online_title?: string | null; created_at: string };
type Product = {
  progressive_number: number;
  box_number: string | null;
  numero_interno_cassa: string | null;
  specie: string | null;
  peso_interno_kg: number | null;
  price_eur: number | null;
};

export default function PricelistPage(props: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = use(props.params);
  const router = useRouter();

  const [catalog, setCatalog] = useState<CatalogInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [pdfLoading, setPdfLoading] = useState<"" | "individual" | "grouped">("");

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const { data: cat } = await sb
        .from("catalogs")
        .select("title, online_title, created_at")
        .eq("id", catalogId)
        .single();
      setCatalog(cat ?? null);

      const { data: prods } = await sb
        .from("products")
        .select("progressive_number, box_number, numero_interno_cassa, specie, peso_interno_kg, price_eur")
        .eq("catalog_id", catalogId)
        .order("progressive_number", { ascending: true });
      setProducts((prods as Product[]) ?? []);
      setLoading(false);
    })();
  }, [catalogId]);

  async function openPdf(mode: "individual" | "grouped") {
    setPdfLoading(mode);
    setMsg("Generazione PDF…");
    try {
      const res = await adminFetch(
        `/api/admin/catalog/pricelist-pdf?catalogId=${catalogId}&mode=${mode}`
      );
      if (!res.ok) {
        const j = await res.json();
        setMsg(j.error ?? "Errore PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setMsg("");
    } catch (e: any) {
      setMsg(String(e?.message ?? "Errore"));
    } finally {
      setPdfLoading("");
    }
  }

  // Stats
  const withPrice = products.filter((p) => p.price_eur != null).length;
  const withPeso = products.filter((p) => p.peso_interno_kg != null).length;
  const totalKg = products.reduce((s, p) => s + (p.peso_interno_kg ?? 0), 0);

  // Grouped preview for the UI
  type UiGroup = { specie: string; price_eur: number | null; count: number; totalKg: number };
  const groupMap = new Map<string, UiGroup>();
  for (const p of products) {
    const specie = p.specie?.trim() || "N/D";
    const key = `${specie}||${p.price_eur ?? ""}`;
    if (!groupMap.has(key)) groupMap.set(key, { specie, price_eur: p.price_eur, count: 0, totalKg: 0 });
    const g = groupMap.get(key)!;
    g.count++;
    g.totalKg += p.peso_interno_kg ?? 0;
  }
  const groups = [...groupMap.values()].sort((a, b) => {
    const sc = a.specie.localeCompare(b.specie, "it");
    if (sc !== 0) return sc;
    return (b.price_eur ?? 0) - (a.price_eur ?? 0);
  });

  return (
    <div className="mx-auto max-w-4xl p-4">
      {/* Nav */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
            onClick={() => router.push("/admin")}
          >
            ← Admin
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
            onClick={() => router.push(`/admin/catalog/${catalogId}/pricing`)}
          >
            ← Catalogo
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
            onClick={() => router.push(`/admin/catalog/${catalogId}/pricing`)}
          >
            Prezzi
          </button>
        </div>
      </div>

      <h1 className="mb-1 text-2xl font-bold">Listino prezzi</h1>
      {catalog && (
        <p className="mb-4 text-sm text-gray-500">
          {catalog.online_title || catalog.title} — {new Date(catalog.created_at).toLocaleDateString("it-IT")}
        </p>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Caricamento…</div>
      ) : (
        <>
          {/* Stats */}
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="rounded-xl border bg-white px-4 py-2 text-center text-sm">
              <div className="text-2xl font-bold">{products.length}</div>
              <div className="text-gray-500">casse</div>
            </div>
            <div className="rounded-xl border bg-white px-4 py-2 text-center text-sm">
              <div className="text-2xl font-bold">{withPeso}</div>
              <div className="text-gray-500">con peso</div>
            </div>
            <div className="rounded-xl border bg-white px-4 py-2 text-center text-sm">
              <div className="text-2xl font-bold">{withPrice}</div>
              <div className="text-gray-500">con prezzo</div>
            </div>
            <div className="rounded-xl border bg-white px-4 py-2 text-center text-sm">
              <div className="text-2xl font-bold">{totalKg.toFixed(1)}</div>
              <div className="text-gray-500">kg totali</div>
            </div>
          </div>

          {/* PDF buttons */}
          <div className="mb-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => openPdf("individual")}
              disabled={!!pdfLoading}
              className="flex items-center gap-2 rounded-xl bg-black px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {pdfLoading === "individual" ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <span>📄</span>
              )}
              Stampa listino completo
            </button>
            <button
              type="button"
              onClick={() => openPdf("grouped")}
              disabled={!!pdfLoading}
              className="flex items-center gap-2 rounded-xl border bg-white px-5 py-3 font-semibold disabled:opacity-60"
            >
              {pdfLoading === "grouped" ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
              ) : (
                <span>📋</span>
              )}
              Stampa per specie
            </button>
          </div>

          {msg && <div className="mb-4 text-sm text-gray-600">{msg}</div>}

          {/* Grouped preview */}
          <h2 className="mb-3 text-lg font-semibold">Riepilogo per specie</h2>
          <div className="space-y-2">
            {groups.map((g, i) => (
              <div key={i} className="rounded-xl border bg-white px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{g.specie}</span>
                  <span className="text-sm text-gray-500">
                    {g.count} {g.count === 1 ? "cassa" : "casse"} —{" "}
                    {g.totalKg.toFixed(2)} kg
                  </span>
                </div>
                {g.price_eur != null && (
                  <div className="mt-0.5 text-sm text-blue-700 font-medium">
                    {g.price_eur.toFixed(2)} €/kg
                  </div>
                )}
              </div>
            ))}

            {groups.length === 0 && (
              <div className="rounded-xl border bg-gray-50 p-6 text-center text-sm text-gray-500">
                Nessun prodotto con specie o prezzo impostato.
                <br />
                Vai su <b>Prezzi</b> per aggiungere specie e prezzi.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
