import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendWhatsAppOrder } from "@/lib/twilioSend";

export const runtime = "nodejs";

type Item = { productId: string; qty: number };

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
    const body = await req.json();

    const catalogId = body.catalogId as string;
    const customerName = (body.customerName as string) || "";
    const customerPhone = (body.customerPhone as string) || "";
    const items = (body.items || []) as Item[];

    if (!catalogId || !customerName.trim() || !customerPhone.trim() || items.length === 0) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    const ownerPhone = process.env.OWNER_PHONE;
    if (!ownerPhone) {
      return NextResponse.json({ error: "OWNER_PHONE non configurato in .env.local" }, { status: 500 });
    }

    const appBaseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
    const supabase = supabaseServer();
    const productIds = items.map((i) => i.productId);

    // 1) crea ordine
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        catalog_id: catalogId,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        owner_phone: ownerPhone,
        status: "created",
      })
      .select()
      .single();

    if (oErr) throw oErr;

    // 2) blocca prodotti (atomic)
    const { error: rErr } = await supabase.rpc("reserve_products", { p_product_ids: productIds });
    if (rErr) {
      await supabase.from("orders").update({ status: "failed" }).eq("id", order.id);
      return NextResponse.json({ error: "Uno o più prodotti sono già esauriti. Riprova." }, { status: 409 });
    }

    // 3) salva righe ordine
    const rows = items.map((it) => ({
      order_id: order.id,
      product_id: it.productId,
      qty: it.qty ?? 1,
    }));
    const { error: iErr } = await supabase.from("order_items").insert(rows);
    if (iErr) throw iErr;

    // 4) chiudi ordine
    const { error: uErr } = await supabase.from("orders").update({ status: "completed" }).eq("id", order.id);
    if (uErr) throw uErr;

    // 5) genera PDF
    let pdfPublicUrl: string | null = null;
    try {
      const res = await fetch(`${appBaseUrl}/api/orders/generate-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const json = await res.json();
      if (res.ok) pdfPublicUrl = json.pdfPublicUrl ?? null;
    } catch {}

    // 6) testo WhatsApp + totale
    let total = 0;

    const { data: orderItems, error: oiErr } = await supabase
      .from("order_items")
      .select("qty, products(id, box_number, progressive_number, price_eur)")
      .eq("order_id", order.id);

    if (oiErr) throw oiErr;

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
      `✅ *${brand}* — Ordine ricevuto\n` +
      `🕒 ${nowIT()}\n` +
      `👤 Cliente: ${customerName.trim()}\n` +
      `📞 Tel: ${customerPhone.trim()}\n` +
      `🧾 Ordine: ${String(order.id).slice(0, 8)}…\n\n` +
      `📦 *Casse:*\n${lines.join("\n")}\n\n` +
      `💶 *Totale:* € ${total.toFixed(2)}\n` +
      (pdfPublicUrl ? `📄 PDF in allegato\n` : `📄 PDF: non disponibile\n`);

    // 7) invio WhatsApp con FALLBACK: se fallisce cliente+te, manda almeno a te
    let wa: any = { attempted: true, ok: false };

    try {
      // Tentativo 1: cliente + te
      const r1 = await sendWhatsAppOrder({
        toPhones: [customerPhone.trim(), ownerPhone],
        body: waText,
        mediaUrl: pdfPublicUrl,
      });

      if (r1.ok > 0) {
        wa = { attempted: true, ok: true, result: r1, fallback_to_owner: false };
      } else {
        // Tentativo 2 (fallback): SOLO a te
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

    return NextResponse.json({
      ok: true,
      debug_version: "WA_FALLBACK_V1",
      orderId: order.id,
      pdfPublicUrl,
      wa,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
