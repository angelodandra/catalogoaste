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
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";

    // 1) Genera PDF di conferma in formato cliente
    const qs = (orderIds as string[]).map((id) => `orderIds=${encodeURIComponent(id)}`).join("&");
    let pdfPublicUrl: string | null = null;

    try {
      const pdfRes = await fetch(`${appBaseUrl}/api/admin/orders/client-confirm-pdf?${qs}`, {
        headers: { Authorization: authHeader },
      });

      if (pdfRes.ok) {
        const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
        const supabase = supabaseServer();
        const safePhone = phone.replace(/\D/g, "");
        const pdfPath = `orders/confirm-${safePhone}-${Date.now()}.pdf`;

        const { error: upErr } = await supabase.storage
          .from("order-pdfs")
          .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

        if (!upErr) {
          const { data: pub } = supabase.storage.from("order-pdfs").getPublicUrl(pdfPath);
          pdfPublicUrl = pub.publicUrl;
        }
      }
    } catch {
      // Continua senza PDF
    }

    // 2) Messaggio di conferma ordine (formato cliente)
    //    NB: Twilio sandbox invia SOLO al numero master verificato.
    //    Quando Twilio sarà approvato per produzione, aggiungere `phone` all'array toPhones.
    const bodyText =
      `✅ CONFERMA ORDINE\n` +
      `Cliente: ${name}\n` +
      `Tel: ${phone}\n` +
      (pdfPublicUrl ? `📄 Riepilogo: ${pdfPublicUrl}` : `Riepilogo: non disponibile`);

    // Invia al numero master (Twilio sandbox: clienti non verificati vengono bloccati)
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
