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
    const username: string = (body.username || "").trim().toLowerCase().replace(/\s+/g, "");
    const password: string = (body.password || "").trim();

    if (!username) {
      return NextResponse.json({ ok: false, error: "Nome utente obbligatorio." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: "La password deve avere almeno 6 caratteri." }, { status: 400 });
    }
    // Consenti solo caratteri alfanumerici, trattino e underscore
    if (!/^[a-z0-9_-]+$/.test(username)) {
      return NextResponse.json(
        { ok: false, error: "Nome utente: solo lettere minuscole, numeri, - e _." },
        { status: 400 }
      );
    }

    const email = `${username}${OP_DOMAIN}`;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // nessuna email di conferma
    });

    if (error) {
      if (error.message.includes("already registered") || error.message.includes("already exists")) {
        return NextResponse.json({ ok: false, error: "Nome utente già in uso." }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      operator: {
        id: data.user.id,
        username,
        email,
        created_at: data.user.created_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore" }, { status: 500 });
  }
}
