import { NextResponse } from "next/server";
import { sendWhatsAppOrder } from "@/lib/twilio";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizePhone } from "@/lib/accessSign";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { phone, name, company } = await req.json();

    const p = normalizePhone(String(phone || ""));
    const n = String(name || "").trim();
    const c = String(company || "").trim();

    if (!p || !n) {
      return NextResponse.json({ ok: false, error: "missing_phone_or_name" }, { status: 400 });
    }

    const supabase = supabaseServer();

    // Se esiste già, NON cambiamo status (resta pending/active/revoked)
    const { data: existing, error: e1 } = await supabase
      .from("customers")
      .select("phone,status")
      .eq("phone", p)
      .maybeSingle();

    if (e1) throw e1;

    const statusToSet = existing?.status ? existing.status : "pending";

    const { data, error } = await supabase
      .from("customers")
      .upsert(
        { phone: p, name: n, company: c || null, status: statusToSet },
        { onConflict: "phone" }
      )
      .select("phone,name,company,status,created_at")
      .single();

    if (error) throw error;

    
  // === WA REGISTER (notify owner) ===
  try {
    const owner = (process.env.OWNER_PHONE || "").trim();
    const base = (process.env.APP_BASE_URL || "").trim();
    if (owner) {
      const link = base ? `${base}/admin/customers` : "/admin/customers";
      await sendWhatsAppOrder({
        toPhones: [owner],
        body: `NUOVA REGISTRAZIONE\nCliente: ${data.name}\nTelefono: ${data.phone}\nLink: ${link}`,
      });
    }
  } catch (e) {
    console.error("WA REGISTER ERROR", e);
  }
  // === END WA REGISTER ===

return NextResponse.json({ ok: true, customer: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
