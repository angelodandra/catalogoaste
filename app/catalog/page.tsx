"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Grid3x3, type ProductUI } from "@/components/Grid3x3";

type ProductRow = {
  id: string;
  progressive_number: number | null;
  box_number: string | null;
  image_path: string | null;
  is_sold: boolean | null;
  price_eur: number | null;
  weight_kg: number | null;
  catalog_id: string;
  catalogs?: {
    title?: string | null;
    online_title?: string | null;
  } | null;
};

export default function CatalogIndexPage() {
  const [products, setProducts] = useState<ProductUI[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    maxProgressive: number;
    activeCatalogIds: string[];
  }>({
    total: 0,
    maxProgressive: 0,
    activeCatalogIds: [],
  });

  async function load() {
    const { data: catalogs } = await supabaseBrowser()
      .from("catalogs")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const activeCatalogIds = (catalogs || []).map((c: any) => c.id);

    const { data, error } = await supabaseBrowser()
      .from("products")
      .select("id, progressive_number, box_number, image_path, is_sold, price_eur, weight_kg, catalog_id, catalogs(title, online_title)")
      .in("catalog_id", activeCatalogIds)
      .eq("is_published", true)
      .order("progressive_number", { ascending: true });

    if (error) return;

    const rows = (data || []) as ProductRow[];
    const maxProgressive = rows.reduce(
      (m, p) => Math.max(m, Number(p.progressive_number || 0)),
      0
    );

    setStats({
      total: rows.length,
      maxProgressive,
      activeCatalogIds,
    });

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    const mapped: ProductUI[] = rows.map((p) => ({
      id: p.id,
      progressive_number: p.progressive_number ?? 0,
      box_number: p.box_number ?? "",
      image_url: `${base}/storage/v1/object/public/catalog-images/${p.image_path}`,
      is_sold: !!p.is_sold,
      price_eur: p.price_eur,
      weight_kg: p.weight_kg ?? null,
      catalog_label: p.catalogs?.online_title || p.catalogs?.title || null,
    }));

    setProducts(mapped);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="mb-2 text-xl font-bold">Disponibile oggi</div>

      <div className="mb-4 rounded-lg border bg-yellow-50 p-3 text-sm">
        <div>Prodotti visibili: {stats.total}</div>
        <div>Primo progressivo libero: {stats.maxProgressive + 1}</div>
      </div>

      <Grid3x3
        products={products}
        onAdd={() => {}}
        showPrices={true}
        canAdd={false}
        selectedIds={[]}
      />
    </div>
  );
}
