import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendWhatsAppOrder } from "@/lib/twilio";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const { orderIds, phone, name } = await req.json();

    if (!Array.isArray(orderIds) || !orderIds.length || !phone) {
      return NextResponse.json({ error: "orderIds (array) e phone sono richiesti" }, { status: 400 });
    }

    const ownerPhone = process.env.OWNER_PHONE || "";
    if (!ownerPhone) {
      return NextResponse.json({ error: "OWNER_PHONE non configurato" }, { status: 500 });
    }

    const appBaseUrl = process.env.APP_BASE_URL || new URL(req.url).origin;

    // 1) Genera PDF combinato chiamando prep-pdf-bulk internamente
    //    Passa il token di autorizzazione dalla request originale
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const qs = (orderIds as string[]).map((id) => `orderIds=${encodeURIComponent(id)}`).join("&");

    let pdfPublicUrl: string | null = null;

    try {
      const pdfRes = await fetch(`${appBaseUrl}/api/admin/orders/prep-pdf-bulk?${qs}`, {
        headers: { Authorization: authHeader },
      });

      if (pdfRes.ok) {
        const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
        const supabase = supabaseServer();
        const safePhone = phone.replace(/\D/g, "");
        const pdfPath = `orders/client-${safePhone}-${Date.now()}.pdf`;

        const { error: upErr } = await supabase.storage
          .from("order-pdfs")
          .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

        if (!upErr) {
          const { data: pub } = supabase.storage.from("order-pdfs").getPublicUrl(pdfPath);
          pdfPublicUrl = pub.publicUrl;
        }
      }
    } catch {
      // PDF non disponibile, ma proviamo comunque a inviare il WA senza media
    }

    // 2) Costruisce messaggio WA
    const bodyText =
      `🧾 RIEPILOGO ORDINI\n` +
      `Cliente: ${name}\n` +
      `Tel: ${phone}\n` +
      `Ordini: ${orderIds.length}\n` +
      (pdfPublicUrl ? `📄 PDF: ${pdfPublicUrl}` : `PDF: non disponibile`);

    // 3) Invia WA al numero master
    //    NB: Twilio sandbox invia SOLO al numero master verificato.
    //    In produzione aggiungere `phone` all'array per mandarlo anche al cliente.
    const result = await sendWhatsAppOrder({
      toPhones: [ownerPhone],
      body: bodyText,
      mediaUrl: pdfPublicUrl,
    });

    const ok = (result.ok ?? 0) > 0 && (result.failed ?? 0) === 0;

    return NextResponse.json({
      ok: true,
      wa_status: ok ? "sent" : "failed",
      wa_error: ok ? null : ((result as any).failures?.[0] ?? "invio fallito"),
      pdfPublicUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
