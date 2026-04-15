import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin, adminErrorResponse } from "@/lib/requireAdmin";

const OP_DOMAIN = "@op.interno";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch (e) {
    return adminErrorResponse(e);
  }

  try {
    const body = await req.json();
    const userId: string = (body.userId || "").trim();
    const email: string = (body.email || "").trim();

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId obbligatorio." }, { status: 400 });
    }
    // Sicurezza: verifica che sia davvero un operatore
    if (!email.endsWith(OP_DOMAIN)) {
      return NextResponse.json({ ok: false, error: "Operazione non consentita." }, { status: 403 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore" }, { status: 500 });
  }
}
