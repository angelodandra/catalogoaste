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

    const appBaseUrl = process.env.APP_BASE_URL || new URL(req.url).origin;
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const ownerPhone = process.env.OWNER_PHONE || "";

    // 1) Genera PDF combinato preparazione (uso interno)
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
      // PDF non disponibile
    }

    // 2) Messaggio riepilogo interno per il titolare
    const bodyText =
      `Riepilogo ordini\n` +
      `Cliente: ${name}\n` +
      `Tel: ${phone}\n` +
      `Ordini: ${orderIds.length}`;

    // 3) Invia al numero master (sandbox Twilio: solo numero verificato)
    if (!ownerPhone) {
      return NextResponse.json({ error: "OWNER_PHONE non configurato" }, { status: 500 });
    }

    const result = await sendWhatsAppOrder({
      toPhones: [ownerPhone],
      body: bodyText,
      mediaUrl: pdfPublicUrl,
    });

    const ok = result.ok > 0 && result.failed === 0;

    return NextResponse.json({
      ok: true,
      wa_status: ok ? "sent" : "failed",
      wa_error: ok ? null : (result.failures[0] ?? "invio fallito"),
      pdfPublicUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
