cat > app/api/admin/add-product/route.ts <<'EOF'
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const catalogId = form.get("catalogId") as string | null;
    const boxNumber = form.get("boxNumber") as string | null;
    const file = form.get("file") as File | null;

    if (!catalogId || !boxNumber || !file) {
      return NextResponse.json({ error: "Dati mancanti (catalogId, boxNumber, file)" }, { status: 400 });
    }

    if (!boxNumber.trim()) {
      return NextResponse.json({ error: "Numero cassa mancante" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Il file deve essere un'immagine" }, { status: 400 });
    }

    const supabase = supabaseServer();

    // Progressivo automatico (max + 1)
    const { data: last, error: lastErr } = await supabase
      .from("products")
      .select("progressive_number")
      .eq("catalog_id", catalogId)
      .order("progressive_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) throw lastErr;

    const nextProgressive = (last?.progressive_number || 0) + 1;

    // Path file
    const originalName = file.name || "photo";
    const ext = (originalName.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ext.match(/^[a-z0-9]+$/) ? ext : "jpg";

    const filePath = `${catalogId}/${Date.now()}_${nextProgressive}.${safeExt}`;

    // Upload immagine
    const { error: uploadError } = await supabase.storage
      .from("catalog-images")
      .upload(filePath, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // Inserisci prodotto in BOZZA (non pubblicato, senza prezzo)
    const { data: product, error: insErr } = await supabase
      .from("products")
      .insert({
        catalog_id: catalogId,
        progressive_number: nextProgressive,
        box_number: boxNumber.trim(),
        image_path: filePath,
        is_sold: false,
        is_published: false,
        price_eur: null,
      })
      .select("id,catalog_id,progressive_number,box_number,image_path,is_sold,is_published,price_eur,created_at")
      .single();

    if (insErr) throw insErr;

    return NextResponse.json({ ok: true, product });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
EOF