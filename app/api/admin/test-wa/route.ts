import { NextResponse } from "next/server";
import { sendWhatsAppOrder } from "@/lib/twilio";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();

    const to = (body.to as string) || "";
    const msg = (body.msg as string) || (body.body as string) || "Test WA ✅";
    const contentSid = ((body.contentSid as string) || undefined) as string | undefined;
    const contentVariables = (body.contentVariables as any) || null;
    const mediaUrl = (body.mediaUrl as string) || null;

    if (!to) return NextResponse.json({ ok: false, error: "Manca 'to'" }, { status: 400 });

    const result = await sendWhatsAppOrder({
      toPhones: [to],
      body: msg,
      mediaUrl,
      contentSid,
      contentVariables,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore" }, { status: 500 });
  }
}
