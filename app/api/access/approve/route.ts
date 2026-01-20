import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizePhone, verifyAccess } from "@/lib/accessSign";
import { sendWhatsAppOrder } from "@/lib/twilio";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const phone = normalizePhone(url.searchParams.get("phone") || "");
    const exp = url.searchParams.get("exp") || "";
    const sig = url.searchParams.get("sig") || "";

    if (!phone || !exp || !sig) {
      return new Response("Dati mancanti", { status: 400 });
    }

    const ok = verifyAccess({ phone, exp, action: "approve", sig });
    if (!ok) return new Response("Link non valido o scaduto", { status: 401 });

    // opzionale: verifica scadenza
    const expMs = Date.parse(exp);
    if (!Number.isFinite(expMs) || expMs < Date.now()) {
      return new Response("Link scaduto", { status: 410 });
    }

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("customers")
      .update({ status: "active" })
      .eq("phone", phone)
      .select("name,company,phone,status")
      .single();

    if (error) throw error;

    // WhatsApp al cliente
    try {
      const body =
        `✅ Autorizzazione APPROVATA\n\n` +
        `Ora puoi vedere i prezzi e fare ordini.\n` +
        `Apri il catalogo dai link che ti invieremo su WhatsApp.`;
      await sendWhatsAppOrder({ toPhones: [phone], body, mediaUrl: null });
    } catch {}

    return new Response(
      `OK ✅ Cliente approvato: ${data.company} (${data.phone})`,
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  } catch (e: any) {
    return new Response(e?.message ?? "Errore server", { status: 500 });
  }
}
