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

    const ok = verifyAccess({ phone, exp, action: "revoke", sig });
    if (!ok) return new Response("Link non valido o scaduto", { status: 401 });

    const expMs = Date.parse(exp);
    if (!Number.isFinite(expMs) || expMs < Date.now()) {
      return new Response("Link scaduto", { status: 410 });
    }

    const supabase = supabaseServer();

    // Qui scegliamo "rejected" come "non accettare"
    const { data, error } = await supabase
      .from("customers")
      .update({ status: "rejected" })
      .eq("phone", phone)
      .select("name,company,phone,status")
      .single();

    if (error) throw error;

    // WhatsApp al cliente
    try {
      const body =
        `❌ Richiesta non accettata\n\n` +
        `Per informazioni contattaci direttamente.`;
      await sendWhatsAppOrder({ toPhones: [phone], body, mediaUrl: null });
    } catch {}

    return new Response(
      `OK ✅ Cliente rifiutato: ${data.company} (${data.phone})`,
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  } catch (e: any) {
    return new Response(e?.message ?? "Errore server", { status: 500 });
  }
}
