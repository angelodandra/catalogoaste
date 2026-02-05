import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizePhone, signAccess } from "@/lib/accessSign";
import { sendWhatsAppOrder } from "@/lib/twilio";

export const runtime = "nodejs";

function buildLinks(baseUrl: string, phone: string) {
  const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h
  const approveSig = signAccess({ action: "approve", phone, exp });
  const revokeSig = signAccess({ action: "revoke", phone, exp });

  const approveUrl = `${baseUrl}/api/access/approve?phone=${encodeURIComponent(phone)}&exp=${encodeURIComponent(
    exp
  )}&sig=${approveSig}`;

  const rejectUrl = `${baseUrl}/api/access/revoke?phone=${encodeURIComponent(phone)}&exp=${encodeURIComponent(
    exp
  )}&sig=${revokeSig}`;

  return { approveUrl, rejectUrl };
}

export async function POST(req: Request) {
  try {
    const { name, company, phone } = await req.json();

    const n = (name || "").trim();
    const c = (company || "").trim();
    const p = normalizePhone(phone || "");

    if (!n || !c || !p) return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });

    const supabase = supabaseServer();

    // se esiste già, non cambiamo status automaticamente (resta pending/active/revoked/rejected)
    const { data: existing } = await supabase
      .from("customers")
      .select("id,status")
      .eq("phone", p)
      .maybeSingle();

    const statusToSet = existing?.status ? existing.status : "pending";

    const { data, error } = await supabase
      .from("customers")
      .upsert(
        { name: n, company: c, phone: p, status: statusToSet },
        { onConflict: "phone" }
      )
      .select("id,name,company,phone,status,created_at")
      .single();

    if (error) throw error;

    const ownerPhone = process.env.OWNER_PHONE || "";
    console.log("REGISTER DEBUG → ownerPhone:", ownerPhone);

    console.log("REGISTER DEBUG → ownerPhone:", ownerPhone);

    const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3000";

    console.log("REGISTER DEBUG", { phone: p, ownerPhone, status: data.status, hasSecret: !!process.env.ACCESS_APPROVE_SECRET, baseUrl });

    // WhatsApp al cliente: richiesta ricevuta (solo se pending)
    try {
      if (data.status === "pending") {
        const body =
          `✅ Registrazione ricevuta\n` +
          `Nome: ${n}\n` +
          `Azienda: ${c}\n` +
          `Telefono: ${p}\n\n` +
          `La richiesta è in approvazione. Appena autorizzato potrai visualizzare prezzi e ordinare.`;

        await sendWhatsAppOrder({
          toPhones: [p],
          body,
          mediaUrl: null,
        });
      }
    } catch (e) {
      console.error("WHATSAPP ERROR:", e);
    }

    // WhatsApp a TE: nuova richiesta con link Approva/Rifiuta (solo se pending)
    try {
      if (ownerPhone && data.status === "pending") {
        const { approveUrl, rejectUrl } = buildLinks(baseUrl, p);

        const body =
          `🆕 RICHIESTA CLIENTE (PENDING)\n` +
          `Nome: ${n}\n` +
          `Azienda: ${c}\n` +
          `Tel: ${p}\n\n` +
          `✅ APPROVA (24h):\n${approveUrl}\n\n` +
          `❌ NON ACCETTARE:\n${rejectUrl}\n`;

        await sendWhatsAppOrder({
          toPhones: [ownerPhone],
          body,
          mediaUrl: null,
        });
      }
    } catch (e) {
      console.error("WHATSAPP ERROR:", e);
    }

    return NextResponse.json({ ok: true, customer: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
