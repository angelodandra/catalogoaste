import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const form = await req.formData();

    const catalogId = form.get("catalogId") as string | null;
    const boxStartRaw = form.get("boxStart") as string | null;
    const stepRaw = form.get("boxStep") as string | null;

    if (!catalogId) return NextResponse.json({ error: "catalogId mancante" }, { status: 400 });

    const boxStart = Number((boxStartRaw ?? "").toString().trim().replace(",", "."));
    const boxStep = Number((stepRaw ?? "1").toString().trim().replace(",", "."));

    if (!Number.isFinite(boxStart)) return NextResponse.json({ error: "Cassa iniziale non valida" }, { status: 400 });
    if (!Number.isFinite(boxStep) || boxStep <= 0) return NextResponse.json({ error: "Step non valido" }, { status: 400 });

    const files = form.getAll("files") as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nessuna foto selezionata" }, { status: 400 });
    }

    // Ordina per nome file (più prevedibile)
    const sorted = [...files].sort((a, b) => (a.name || "").localeCompare(b.name || "", "it", { numeric: true }));

    const supabase = supabaseServer();

    // Progressivo di partenza (max + 1)
    const { data: last, error: lastErr } = await supabase
      .from("products")
      .select("progressive_number")
      .eq("catalog_id", catalogId)
      .order("progressive_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) throw lastErr;

    let nextProgressive = (last?.progressive_number || 0) + 1;

    const inserted: any[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i];
      if (!file || !file.type || !file.type.startsWith("image/")) continue;

      const boxNumber = String(boxStart + i * boxStep);

      const ext = ((file.name || "photo").split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext.match(/^[a-z0-9]+$/) ? ext : "jpg";

      const filePath = `${catalogId}/${Date.now()}_${nextProgressive}_${i}.${safeExt}`;

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
          box_number: boxNumber,
          image_path: filePath,
          is_sold: false,
          is_published: false,
          price_eur: null,
        })
        .select("id,progressive_number,box_number,image_path,is_sold,is_published,price_eur,created_at")
        .single();

      if (insErr) throw insErr;

      inserted.push(product);
      nextProgressive += 1;
    }

    return NextResponse.json({ ok: true, insertedCount: inserted.length, inserted });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
