/**
 * Genera il PDF di conferma ordine in formato cliente,
 * lo carica su Supabase storage e restituisce l'URL pubblico.
 * Usato dal bottone "WA cliente" (wa.me link) per includere il PDF nel messaggio.
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const { orderIds, phone } = await req.json();
    if (!Array.isArray(orderIds) || !orderIds.length || !phone) {
      return NextResponse.json({ error: "orderIds e phone richiesti" }, { status: 400 });
    }

    const appBaseUrl = process.env.APP_BASE_URL || new URL(req.url).origin;
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";

    // 1) Genera PDF tramite client-confirm-pdf
    const qs = (orderIds as string[]).map((id) => `orderIds=${encodeURIComponent(id)}`).join("&");
    const pdfRes = await fetch(`${appBaseUrl}/api/admin/orders/client-confirm-pdf?${qs}`, {
      headers: { Authorization: authHeader },
    });

    if (!pdfRes.ok) {
      return NextResponse.json({ error: "Errore generazione PDF" }, { status: 500 });
    }

    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // 2) Carica su Supabase storage
    const supabase = supabaseServer();
    const safePhone = phone.replace(/\D/g, "");
    const pdfPath = `orders/confirm-${safePhone}-${Date.now()}.pdf`;

    const { error: upErr } = await supabase.storage
      .from("order-pdfs")
      .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (upErr) {
      return NextResponse.json({ error: "Errore upload PDF: " + upErr.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from("order-pdfs").getPublicUrl(pdfPath);

    return NextResponse.json({ ok: true, pdfPublicUrl: pub.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
