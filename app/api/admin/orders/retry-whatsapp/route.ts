import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendWhatsAppOrder } from "@/lib/twilioSend";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

function eur(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `€ ${v.toFixed(2)}`;
}
function nowIT() {
  return new Date().toLocaleString("it-IT");
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId mancante" }, { status: 400 });

    const supabase = supabaseServer();
    const appBaseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
    const ownerPhone = process.env.OWNER_PHONE;
    if (!ownerPhone) return NextResponse.json({ error: "OWNER_PHONE non configurato" }, { status: 500 });

    // 1) Leggi ordine
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, customer_name, customer_phone, owner_phone, wa_status")
      .eq("id", orderId)
      .single();

    if (oErr) throw oErr;

    const customerName = String(order.customer_name || "").trim();
    const customerPhone = String(order.customer_phone || "").trim();

    // 2) Rigenera/assicura PDF (se fallisce, continuiamo senza bloccare)
    let pdfPublicUrl: string | null = null;
    try {
      const res = await fetch(`${appBaseUrl}/api/orders/generate-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json();
      if (res.ok) pdfPublicUrl = json.pdfPublicUrl ?? null;
    } catch {}

    // 3) Carica righe + prodotti per testo
    const { data: orderItems, error: oiErr } = await supabase
      .from("order_items")
      .select("qty, products(id, box_number, progressive_number, price_eur)")
      .eq("order_id", orderId);

    if (oiErr) throw oiErr;

    let total = 0;
    const lines: string[] = [];

    for (const it of (orderItems as any[]) || []) {
      const p = it.products;
      const qty = Number(it.qty ?? 1);
      const price = p?.price_eur === null || p?.price_eur === undefined ? null : Number(p.price_eur);
      if (price !== null && Number.isFinite(price)) total += price * qty;

      const box = p?.box_number ?? "?";
      const prog = p?.progressive_number ?? "?";
      lines.push(`• Cassa ${box} (Prog ${prog}) — ${eur(price)} × ${qty}`);
    }

    const brand = process.env.BRAND_NAME || "F.lli D'Andrassi";
    const waText =
      `🔁 *${brand}* — Reinoltro ordine\n` +
      `🕒 ${nowIT()}\n` +
      `👤 Cliente: ${customerName}\n` +
      `📞 Tel: ${customerPhone}\n` +
      `🧾 Ordine: ${String(orderId).slice(0, 8)}…\n\n` +
      `📦 *Casse:*\n${lines.join("\n")}\n\n` +
      `💶 *Totale:* € ${total.toFixed(2)}\n` +
      (pdfPublicUrl ? `📄 PDF in allegato\n` : `📄 PDF: non disponibile\n`);

    // 4) Invia WhatsApp con fallback
    let wa: any = { attempted: true, ok: false };

    try {
      const r1 = await sendWhatsAppOrder({
        toPhones: [customerPhone, ownerPhone],
        body: waText,
        mediaUrl: pdfPublicUrl,
      });

      if (r1.ok > 0) {
        wa = { attempted: true, ok: true, result: r1, fallback_to_owner: false };
      } else {
        const r2 = await sendWhatsAppOrder({
          toPhones: [ownerPhone],
          body: waText + "\n\n⚠️ Nota: invio al cliente non riuscito (limite Twilio/numero non abilitato).",
          mediaUrl: pdfPublicUrl,
        });

        wa = { attempted: true, ok: r2.ok > 0, result: r2, fallback_to_owner: true, first_attempt: r1 };
      }
    } catch (e: any) {
      wa = { attempted: true, ok: false, error: e?.message ?? String(e) };
    }

    // 5) Salva stato su DB
    const wa_status = wa?.ok ? "sent" : "failed";
    const wa_error =
      wa?.ok ? null : (wa?.result?.failures?.[0] ?? wa?.error ?? "WhatsApp send failed");

    const { error: updErr } = await supabase
      .from("orders")
      .update({
        wa_status,
        wa_error,
        wa_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updErr) throw updErr;

    return NextResponse.json({ ok: true, wa_status, wa_error, wa, pdfPublicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
