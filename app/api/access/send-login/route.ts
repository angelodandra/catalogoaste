import { NextResponse } from "next/server";
import { normalizePhone, signAccess } from "@/lib/accessSign";
import { sendWhatsAppOrder } from "@/lib/twilio";

export const runtime = "nodejs";

/**
 * POST /api/access/send-login
 * Body JSON:
 *  - phone: string (numero cliente)
 *  - catalogId: string (uuid catalogo)
 *
 * Protezione:
 *  - header: x-admin-token deve combaciare con process.env.ADMIN_TOKEN
 */
export async function POST(req: Request) {
  try {
    const adminToken = process.env.ADMIN_TOKEN || "";
    const headerToken = req.headers.get("x-admin-token") || "";
    if (!adminToken || headerToken !== adminToken) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const phone = normalizePhone(String(body?.phone || ""));
    const catalogId = String(body?.catalogId || "").trim();

    if (!phone || phone.length < 8) {
      return NextResponse.json({ ok: false, error: "phone_invalid" }, { status: 400 });
    }
    if (!catalogId) {
      return NextResponse.json({ ok: false, error: "catalogId_missing" }, { status: 400 });
    }

    const base = process.env.APP_BASE_URL || "http://127.0.0.1:3000";

    // link firmato valido 7 giorni (exp in UNIX seconds)
    const exp = String(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);
    const sig = signAccess({ action: "login", phone, exp });

    const nextPath = `/catalog/${catalogId}`;
    const loginUrl =
      `${base}/api/access/login` +
      `?phone=${encodeURIComponent(phone)}` +
      `&exp=${encodeURIComponent(exp)}` +
      `&sig=${encodeURIComponent(sig)}` +
      `&next=${encodeURIComponent(nextPath)}`;

    // Messaggio SOLO LINK (così è “tap & go”)
    await sendWhatsAppOrder({
      toPhones: [phone],
      body: loginUrl,
      mediaUrl: null,
    });

    return NextResponse.json({ ok: true, phone, catalogId, loginUrl });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "server_error" }, { status: 500 });
  }
}
