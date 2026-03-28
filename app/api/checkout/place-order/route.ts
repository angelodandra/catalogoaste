import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendWhatsAppOrder } from "@/lib/twilio";

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

function normalizePhone(raw: string) {
  let s = (raw || "").trim();
  // togli spazi, trattini, parentesi ecc. mantenendo + e numeri
  s = s.replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    // casi comuni IT
    if (s.startsWith("39")) s = "+" + s;
    else if (s.length === 10 && s.startsWith("3")) s = "+39" + s;
    else s = "+39" + s;
  }
  return s;
}


export async function POST(req: Request) {
  const supabase = supabaseServer();


    // rollback scope (serve anche nel catch finale)
    let productIds: string[] = [];
    let reservedOk = false;
  try {
    const __waDebug: any = { step: "start" };
    const body = await req.json();

    const catalogId = body.catalogId as string;
    const cookieStore = await cookies();
    const customerPhoneRaw = cookieStore.get("customer_phone")?.value || "";
    const items = (body.items || []) as Item[];
    const sellerCustomerName = body.customerName ? String(body.customerName).trim() : "";

    if (!customerPhoneRaw.trim() || items.length === 0) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    const customerPhoneN = customerPhoneRaw;

    // 🔒 Prendi SEMPRE i dati dal customer registrato
    const { data: customer, error: cErr } = await supabase
      .from("customers")
      .select("name, company, phone, status")
      .eq("phone", customerPhoneN)
      .maybeSingle();

    if (cErr) throw cErr;

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente non registrato. Fai prima la registrazione." },
        { status: 403 }
      );
    }

    if (customer.status !== "active") {
      return NextResponse.json(
        { error: "Cliente non autorizzato (in attesa approvazione)." },
        { status: 403 }
      );
    }

    let customerName = String(customer.name || "").trim();
    if (sellerCustomerName) customerName = sellerCustomerName;
    if (!customerName) {
      return NextResponse.json({ error: "Cliente registrato ma senza nome." }, { status: 400 });
    }

    const ownerPhone = process.env.OWNER_PHONE;
    if (!ownerPhone) {
      return NextResponse.json({ error: "OWNER_PHONE non configurato in .env.local" }, { status: 500 });
    }
    const ownerPhoneN = normalizePhone(ownerPhone);

    const appBaseUrl = process.env.APP_BASE_URL || new URL(req.url).origin;

    productIds = items.map((i) => i.productId);

    // 0) PRE-CHECK: verifica disponibilità prodotti PRIMA di creare l'ordine
    const { data: productsCheck, error: pcErr } = await supabase
      .from("products")
      .select("id, box_number, progressive_number, is_sold")
      .in("id", productIds);

    if (pcErr) throw pcErr;

    const soldProducts = (productsCheck || []).filter((p) => p.is_sold);
    const availableProductIds = (productsCheck || []).filter((p) => !p.is_sold).map((p) => p.id);
    const skippedInfo = soldProducts.map((p) => ({
      productId: p.id,
      label: `Cassa ${p.box_number} (Prog ${p.progressive_number})`,
    }));

    // Se TUTTI i prodotti sono esauriti → errore, non creo nemmeno l'ordine
    if (availableProductIds.length === 0) {
      return NextResponse.json(
        {
          error: "Tutti i prodotti nel carrello sono già esauriti.",
          skipped: skippedInfo,
        },
        { status: 409 }
      );
    }

    // Filtra items: tieni solo quelli disponibili
    const availableItems = items.filter((i) => availableProductIds.includes(i.productId));
    productIds = availableProductIds;

// 1) crea ordine (usa dati customers) — solo con prodotti disponibili
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        catalog_id: catalogId,
        customer_name: customerName,
        customer_phone: customerPhoneN,
        owner_phone: ownerPhoneN || ownerPhone.trim(),
        status: "created",
      })
      .select()
      .single();

    if (oErr) throw oErr;

    const pdfLink = `${appBaseUrl}/o/${order.id}`;


    // 2) IDEMPOTENZA: verifica se lo STESSO cliente ha già ordinato gli stessi prodotti
    const { data: existingItems } = await supabase
      .from("order_items")
      .select("order_id, orders!inner(id, status, customer_phone)")
      .in("product_id", productIds)
      .eq("orders.status", "completed")
      .eq("orders.customer_phone", customerPhoneN);

    if (existingItems && existingItems.length > 0) {
      const existingOrderId = existingItems[0].order_id;
      return NextResponse.json({
        ok: true,
        orderId: existingOrderId,
        pdfPublicUrl: `/o/${existingOrderId}`,
        note: "ordine già esistente (idempotente)",
        skipped: skippedInfo,
      });
    }

// 3) blocca prodotti disponibili (atomic)
console.log("RESERVE RPC productIds:", productIds);

const { data: rData, error: rErr } = await supabase.rpc("reserve_products", { p_product_ids: productIds });
console.log("RESERVE RPC result:", rData);
console.log("RESERVE RPC error:", rErr);

if (rErr) {
  // reserve fallita: segno ordine failed (best-effort) e torno 409
  try {
    await supabase.from("orders").update({ status: "failed" }).eq("id", order.id);
  } catch {}
  return NextResponse.json(
    {
      error: "Uno o più prodotti sono già esauriti. Riprova.",
      skipped: skippedInfo,
      debug:
        process.env.NODE_ENV !== "production"
          ? {
              rpc_error: rErr,
            }
          : undefined,
    },
    { status: 409 }
  );
}

reservedOk = true;

// DEBUG: forza errore subito dopo la reserve (per test rollback)
    if (body?.debugFailAfterReserve) throw new Error("DEBUG_FAIL_AFTER_RESERVE");

    // 4) salva righe ordine (solo prodotti disponibili)
    const rows = availableItems.map((it) => ({
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
    let rCust: any = null;
    try {
      const res = await fetch(new URL("/api/orders/generate-pdf", appBaseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });


      const raw = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(raw);
      } catch {}

      __waDebug.pdf = {
        ok: res.ok,
        status: res.status,
        body: json ?? raw,
      };

      if (res.ok) pdfPublicUrl = (json?.pdfPublicUrl ?? null) as any;
    } catch (e: any) {
      __waDebug.pdf = { ok: false, error: e?.message ?? String(e) };
    }
    // 6) prepara testo WhatsApp
    const { data: orderItems, error: oiErr } = await supabase
      .from("order_items")
      .select("qty, products(id, box_number, progressive_number, price_eur, weight_kg)")
      .eq("order_id", order.id);

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
      const w = p?.weight_kg === null || p?.weight_kg === undefined ? null : Number(p.weight_kg);
      const wTxt = w !== null && Number.isFinite(w) ? ` ≈ ${w.toFixed(2)} kg` : "";
      lines.push(`• Cassa ${box} (Prog ${prog})${wTxt} — ${eur(price)} × ${qty}`);
    }

    const brand = process.env.BRAND_NAME || "F.lli D'Andrassi";
    const waText =
      `✅ *${brand}* — Ordine ricevuto\n` +
      `🕒 ${nowIT()}\n` +
      `👤 Cliente: ${customerName}\n` +
      `📞 Tel: ${customerPhoneN}\n` +
      `🧾 Ordine: ${String(order.id).slice(0, 8)}…\n\n` +
      `📦 *Casse:*\n${lines.join("\n")}\n\n` +
      `💶 *Totale:* € ${total.toFixed(2)}\n` +
      (pdfPublicUrl ? `📄 PDF: ${pdfLink}\n` : `📄 PDF: non disponibile\n`);

    __waDebug.step = "before_whatsapp";

    // 7) invio WhatsApp (OWNER + CLIENTE, con PDF)
    let waOk = false;
    let waError: string | null = null;

    let waOwnerSid: string | null = null;
    let waCustomerSid: string | null = null;

    try {
      const r = await sendWhatsAppOrder({
        toPhones: [ownerPhoneN || ownerPhone.trim()],
        body: waText,
        mediaUrl: pdfPublicUrl,
      });


      waOwnerSid = (r as any)?.successes?.[0]?.sid ?? null;
      waOk = (r.ok ?? 0) > 0;
      if (!waOk) waError = r.failures?.[0] ?? "WhatsApp send failed";
    } catch (e: any) {
      waOk = false;
      waError = e?.message ?? String(e);
    }


    // 7b) invio WhatsApp al CLIENTE (template approvato)
    try {
      const tpl = (process.env.TWILIO_TEMPLATE_CONFERMA_ORDINE || "").trim();
      const fallback =
        `✅ ${brand} — Conferma ordine
` +
        `🕒 ${nowIT()}
` +
        `👤 Cliente: ${customerName}
` +
        `💶 Totale: € ${total.toFixed(2)}
` +
        (pdfPublicUrl ? `📄 PDF: ${pdfLink}
` : ``);

      if (tpl) {
        if (process.env.WA_SEND_TO_CUSTOMER === "1") {
        if (process.env.WA_SEND_TO_CUSTOMER === "1") {
          const rCust = await sendWhatsAppOrder({
          toPhones: [customerPhoneN],
          contentSid: tpl,
          contentVariables: {}, // per ora senza variabili
        });

        const ok = (rCust as any)?.ok ?? 0;
        if (!ok) {
          console.error("WA CUSTOMER FAILURES:", (rCust as any)?.failures ?? []);
        }

        waCustomerSid = (rCust as any)?.successes?.[0]?.sid ?? null;
      } else {
        const rCust = await sendWhatsAppOrder({
          toPhones: [customerPhoneN],
          body: fallback,
          mediaUrl: pdfPublicUrl,
        });
        }
      }
        waCustomerSid = (rCust as any)?.successes?.[0]?.sid ?? null;
      }
    } catch (e: any) {
      console.error("WA CUSTOMER ERROR:", e?.message ?? String(e));
    }

    // 8) salva stato WA su DB (best-effort)
    try {
      await supabase
        .from("orders")
        .update({
          wa_status: waOk ? "sent" : "failed",
          wa_error: waOk ? null : waError,
          wa_last_attempt_at: new Date().toISOString(),
          wa_owner_sid: waOwnerSid,
          wa_customer_sid: waCustomerSid,
        })
        .eq("id", order.id);

      __waDebug.wa_status = waOk ? "sent" : "failed";
      __waDebug.wa_error = waOk ? null : waError;
    } catch {}

    
    // === WA_ADMIN_ON_ORDER ===
    try {
      if (ownerPhone && pdfPublicUrl) {
        await sendWhatsAppOrder({
          toPhones: [ownerPhone],
          body: `🆕 NUOVO ORDINE\nCliente: ${customerName}\nTelefono: ${customerPhoneN}`,
          mediaUrl: pdfPublicUrl,
        });
      }
    } catch (e) {
      console.error("WA ADMIN ERROR", e);
    }
    // === END WA_ADMIN_ON_ORDER ===


    // === OWNER WA (sandbox) ===
    try {
      const owner = (process.env.OWNER_PHONE || "").trim();
      const forceOwnerOnly = String(process.env.WA_FORCE_OWNER_ONLY || "0") === "1";
      const waMode = (process.env.WA_MODE || "").trim(); // "sandbox" | ""
      if (owner && (forceOwnerOnly || waMode === "sandbox")) {
        const link = `${process.env.APP_BASE_URL || ""}/o/${order.id}`;
        await sendWhatsAppOrder({
          toPhones: [owner],
          body: `🆕 NUOVO ORDINE\nCliente: ${customerName}\nTelefono: ${customerPhoneN}\nLink: ${link}`,
          mediaUrl: null,
        });
      }
    } catch (e) {
      console.error("OWNER WA ERROR", e);
    }
    // === /OWNER WA (sandbox) ===

return NextResponse.json({ ok: true, orderId: order.id, pdfPublicUrl, skipped: skippedInfo, wa_debug: __waDebug });
  } catch (e: any) {
    // rollback: se avevamo riservato le casse e poi qualcosa è fallito, le rimettiamo disponibili
    // NB: via RPC (come reserve_products) per evitare problemi di permessi/RLS
    try {
      if (reservedOk) {
        const { error: unErr } = await supabase.rpc("unreserve_products", { p_product_ids: productIds });
        if (unErr) throw unErr;
      }
    } catch {}

    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
