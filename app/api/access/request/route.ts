import { NextResponse } from "next/server";
import { sendWhatsAppOrder } from "@/lib/twilio";
import { normalizePhone, signAccess } from "@/lib/accessSign";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { phone, note } = await req.json();

    const ownerPhone = process.env.OWNER_PHONE || "";
    if (!ownerPhone) return NextResponse.json({ error: "OWNER_PHONE non configurato" }, { status: 500 });

    const p = normalizePhone(phone || "");
    if (!p || p.length < 8) return NextResponse.json({ error: "Numero non valido" }, { status: 400 });

    const base = process.env.APP_BASE_URL || "http://127.0.0.1:3000";

    // link firmati validi 7 giorni
    const exp = String(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);
    const sigApprove = signAccess({ action: "approve", phone: p, exp });
    const sigRevoke = signAccess({ action: "revoke", phone: p, exp });
    const sigLogin = signAccess({ action: "login", phone: p, exp });

    const approveUrl = `${base}/api/access/approve?phone=${encodeURIComponent(p)}&exp=${exp}&sig=${sigApprove}`;
    const revokeUrl = `${base}/api/access/revoke?phone=${encodeURIComponent(p)}&exp=${exp}&sig=${sigRevoke}`;
    const loginUrl = `${base}/api/access/login?phone=${encodeURIComponent(p)}&exp=${exp}&sig=${sigLogin}`;

    // 1) Messaggio info (senza link)
    await sendWhatsAppOrder({
      toPhones: [ownerPhone],
      body:
        `🔐 RICHIESTA AUTORIZZAZIONE\n` +
        `Numero: ${p}\n` +
        (note ? `Note: ${note}\n` : "") +
        `\nTi mando i link in 2 messaggi separati.`,
      mediaUrl: null,
    });

    // 2) Messaggio SOLO LINK approve
    await sendWhatsAppOrder({
      toPhones: [ownerPhone],
      body: approveUrl,
      mediaUrl: null,
    });

    // 3) Messaggio SOLO LINK revoke
    await sendWhatsAppOrder({
      toPhones: [ownerPhone],
      body: revokeUrl,
      mediaUrl: null,
    });

    return NextResponse.json({ ok: true, approveUrl, revokeUrl, loginUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
