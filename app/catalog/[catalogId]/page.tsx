"use client";

import { use, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Grid3x3, type ProductUI } from "@/components/Grid3x3";
import AccessGate from "@/components/AccessGate";
import FloatingCartButton from "@/components/FloatingCartButton";
import CartDrawer from "@/components/CartDrawer";
import { useRouter } from "next/navigation";


type CartItem = { product: ProductUI; qty: number };
export default function CatalogClientPage(props: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = use(props.params);
  const router = useRouter();

  const [products, setProducts] = useState<ProductUI[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [cartReady, setCartReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`cart:${catalogId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setCart(parsed);
    } catch {
      setCart([]);
    } finally {
      setCartReady(true);
    }
  }, [catalogId]);

  useEffect(() => {
    if (!cartReady) return;
    localStorage.setItem(`cart:${catalogId}`, JSON.stringify(cart));
  }, [cart, catalogId, cartReady]);

  async function load() {
    const { data, error } = await supabaseBrowser()
      .from("products")
      .select("id, progressive_number, box_number, image_path, is_sold, is_published, price_eur, weight_kg")
      .eq("catalog_id", catalogId)
      .eq("is_published", true) // ✅ clienti vedono SOLO pubblicati
      .order("progressive_number", { ascending: true });

    if (error) return;

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const mapped: ProductUI[] = (data || []).map((p: any) => ({
      id: p.id,
      progressive_number: p.progressive_number,
      box_number: p.box_number,
      image_url: `${base}/storage/v1/object/public/catalog-images/${p.image_path}`,
      is_sold: p.is_sold,
      price_eur: p.price_eur,
      weight_kg: p.weight_kg ?? null,
    }));

    setProducts(mapped);
  }

  useEffect(() => {
    load();

    // realtime: se cambia is_sold o price/publish, aggiorna
    const ch = supabaseBrowser()
      .channel(`products-${catalogId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `catalog_id=eq.${catalogId}` },
        () => {
          // più semplice: ricarico lista (visto che filtriamo su is_published)
          load();
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser().removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId]);

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
    setCartOpen(true);
  }

  function setQty(productId: string, qty: number) {
    setCart((prev) => prev.map((x) => (x.product.id === productId ? { ...x, qty } : x)));
  }

  function remove(productId: string) {
    setCart((prev) => prev.filter((x) => x.product.id !== productId));
  }

  const cartCount = cart.length;
return (
    <div className="mx-auto max-w-5xl p-4">
      
      <AccessGate onAuthorizedChange={setAuthorized} />
<div className="mb-6 flex justify-center">
        <img src="/logo.jpg" alt="Logo azienda" className="h-20 w-auto" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xl font-bold">Catalogo</div>

        <button
          className="rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
          disabled={!cartReady || cartCount === 0}
          onClick={() => setCartOpen(true)}
        >
          Carrello ({cartReady ? cartCount : 0})
        </button>
      </div>

      <div className="mt-4">
        <Grid3x3 products={products} onAdd={addToCart} showPrices={authorized} canAdd={authorized} />

        <FloatingCartButton count={cartCount} onOpen={() => setCartOpen(true)} />
</div>

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart.map((x) => x.product)}
        setQty={setQty}
        onRemove={(id: string) => remove(id)}
        onCheckout={() => authorized && router.push(`/checkout/${catalogId}`)}
      />
    </div>
  );
}
