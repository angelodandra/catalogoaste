import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendWhatsAppOrder } from "@/lib/twilio";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId mancante" }, { status: 400 });

    const supabase = supabaseServer();

    // 1) leggi ordine
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, customer_name, customer_phone, created_at")
      .eq("id", orderId)
      .single();

    if (oErr) throw oErr;
    if (!order) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

    const ownerPhone = process.env.OWNER_PHONE || "";
    if (!ownerPhone) return NextResponse.json({ error: "OWNER_PHONE non configurato" }, { status: 500 });

    const appBaseUrl = process.env.APP_BASE_URL || new URL(req.url).origin;

    // 2) rigenera PDF (usa gli item attuali dell'ordine)
    let pdfPublicUrl: string | null = null;
    try {
      const res = await fetch(`${appBaseUrl}/api/orders/generate-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const j = await res.json();
      if (res.ok) pdfPublicUrl = j.pdfPublicUrl ?? null;
    } catch {}

    // 3) invio WA (cliente + te)
    const bodyText =
      `🧾 ORDINE AGGIORNATO\n` +
      `Cliente: ${order.customer_name}\n` +
      `Tel: ${order.customer_phone}\n` +
      `Ordine: ${order.id.slice(0, 8)}…\n` +
      (pdfPublicUrl ? `PDF: ${pdfPublicUrl}\n` : `PDF: (non disponibile)\n`);

    const result = await sendWhatsAppOrder({
      toPhones: [order.customer_phone, ownerPhone],
      body: bodyText,
      mediaUrl: pdfPublicUrl,
    });

    // salva SID (match per destinatario)
    const successes = ((result as any)?.successes ?? []) as { sid: string; to: string }[];

    const norm = (n: string) => {
      const v = String(n || "").trim();
      if (!v) return "";
      if (v.startsWith("whatsapp:")) return v;
      if (v.startsWith("+")) return `whatsapp:${v}`;
      return `whatsapp:+${v}`;
    };

    const wantOwner = norm(ownerPhone);
    const wantCustomer = norm(order.customer_phone);

    const waOwnerSid = successes.find((x) => String(x.to) === wantOwner)?.sid ?? null;
    const waCustomerSid = successes.find((x) => String(x.to) === wantCustomer)?.sid ?? null;

    const ok = (result.ok ?? 0) > 0 && (result.failed ?? 0) === 0;

    // 4) aggiorna stato WA su orders
    await supabase
      .from("orders")
      .update({
        wa_status: ok ? "sent" : "failed",
        wa_error: ok ? null : ((result as any).failures?.[0] ?? "invio fallito"),
        wa_owner_sid: waOwnerSid,
        wa_customer_sid: waCustomerSid,
        wa_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    return NextResponse.json({
      ok: true,
      orderId,
      pdfPublicUrl,
      wa_status: ok ? "sent" : "failed",
      wa_error: ok ? null : (result.failures?.[0] ?? "invio fallito"),
      result,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
