"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Grid3x3, type ProductUI } from "@/components/Grid3x3";
import AccessGate from "@/components/AccessGate";
import FloatingCartButton from "@/components/FloatingCartButton";
import CartDrawer from "@/components/CartDrawer";
import { useRouter } from "next/navigation";

type CartItem = { product: ProductUI; qty: number };

export default function CatalogIndexPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductUI[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [noCatalogs, setNoCatalogs] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cart:global");
      const parsed = raw ? JSON.parse(raw) : [];
      setCart(parsed);
    } catch {
      setCart([]);
    } finally {
      setCartReady(true);
    }
  }, []);

  useEffect(() => {
    if (!cartReady) return;
    localStorage.setItem("cart:global", JSON.stringify(cart));
  }, [cart, cartReady]);

  async function load() {
    const { data: catalogs } = await supabaseBrowser()
      .from("catalogs")
      .select("id,title,online_title")
      .eq("is_visible", true)
      .order("created_at", { ascending: false });

    const ids = (catalogs || []).map((c: any) => c.id);

    if (!ids.length) {
      setProducts([]);
      setNoCatalogs(true);
      return;
    }
    setNoCatalogs(false);

    const { data, error } = await supabaseBrowser()
      .from("products")
      .select("id, progressive_number, box_number, image_path, is_sold, is_published, price_eur, weight_kg, catalog_id, catalogs(title, online_title)")
      .in("catalog_id", ids)
      .eq("is_published", true)  // ✅ clienti vedono SOLO pubblicati; i venduti spariscono solo con "Elimina venduti"
      .order("progressive_number", { ascending: true });

    if (error) return;

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const mapped: ProductUI[] = (data || []).map((p: any) => {
      const c = Array.isArray(p.catalogs) ? p.catalogs[0] : p.catalogs;
      return {
        id: p.id,
        progressive_number: p.progressive_number,
        box_number: p.box_number,
        image_url: `${base}/storage/v1/object/public/catalog-images/${p.image_path}`,
        is_sold: p.is_sold,
        price_eur: p.price_eur,
        weight_kg: p.weight_kg ?? null,
        catalog_label: c?.online_title || c?.title || null,
        catalog_id: p.catalog_id,
      } as ProductUI & { catalog_id: string };
    });

    setProducts(mapped);

    setCart((prev) =>
      prev.filter((item) => {
        const updated = mapped.find((p) => p.id === item.product.id);
        return updated && !updated.is_sold;
      })
    );
  }

  useEffect(() => {
    load();

    const ch = supabaseBrowser()
      .channel("catalog-visible-products")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser().removeChannel(ch);
    };
  }, []);

  function addToCart(p: ProductUI) {
    if (!authorized) return;
    if (p.is_sold) return;

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.product.id === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { product: p, qty: 1 }];
    });
  }

  function setQty(productId: string, qty: number) {
    setCart((prev) => prev.map((x) => (x.product.id === productId ? { ...x, qty } : x)));
  }

  function remove(productId: string) {
    setCart((prev) => prev.filter((x) => x.product.id !== productId));
  }

  const cartCount = cart.length;

  if (noCatalogs) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-8 text-center">
        <img src="/logo.jpg" alt="Logo azienda" className="mb-8 h-28 w-auto" />
        <div className="text-2xl font-bold text-gray-800">Nessun catalogo disponibile</div>
        <div className="mt-3 max-w-sm text-gray-500">
          Al momento non ci sono prodotti in vendita.<br />
          Torna a breve per scoprire le nuove disponibilità.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4">
      <AccessGate onAuthorizedChange={setAuthorized} />

      <div className="mb-6 flex justify-center">
        <img src="/logo.jpg" alt="Logo azienda" className="h-20 w-auto" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xl font-bold">Disponibile</div>

        <button
          className="rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
          disabled={!cartReady || cartCount === 0}
          onClick={() => setCartOpen(true)}
        >
          Carrello ({cartReady ? cartCount : 0})
        </button>
      </div>

      <div className="mt-4">
        <Grid3x3
          products={products}
          onAdd={addToCart}
          showPrices={authorized}
          canAdd={authorized}
          selectedIds={cart.map((x) => x.product.id)}
        />

        <FloatingCartButton count={cartCount} onOpen={() => setCartOpen(true)} />
      </div>

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart.map((x) => x.product)}
        setQty={setQty}
        onRemove={(id: string) => remove(id)}
        onCheckout={() => router.push("/checkout")}
      />
    </div>
  );
}
