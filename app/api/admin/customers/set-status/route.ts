import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendWhatsAppOrder } from "@/lib/twilio";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { customerId, status } = await req.json();
    if (!customerId) return NextResponse.json({ error: "customerId mancante" }, { status: 400 });
    if (!status || !["active", "revoked"].includes(status))
      return NextResponse.json({ error: "status non valido" }, { status: 400 });

    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("customers")
      .update({ status })
      .eq("id", customerId)
      .select("id,name,company,phone,status,created_at,updated_at")
      .single();

    if (error) throw error;

    // WhatsApp feedback al cliente (quando approvi/rimuovi dal pannello admin)
    try {
      const phone = (data?.phone || "").toString().trim();
      if (phone) {
        if (status === "active") {
          const body =
            `✅ Autorizzazione APPROVATA\n\n` +
            `Ora puoi vedere i prezzi e fare ordini.`;
          await sendWhatsAppOrder({ toPhones: [phone], body, mediaUrl: null });
        } else if (status === "revoked") {
          const body =
            `❌ Autorizzazione REVOCATA\n\n` +
            `Per informazioni contattaci direttamente.`;
          await sendWhatsAppOrder({ toPhones: [phone], body, mediaUrl: null });
        }
      }
    } catch {}

    return NextResponse.json({ ok: true, customer: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore" }, { status: 500 });
  }
}
