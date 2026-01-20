import { NextResponse } from "next/server";
import { sendWhatsAppOrder } from "@/lib/twilio";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const to = body.to as string;
    const msg = (body.msg as string) || "Test WA ✅";

    if (!to) return NextResponse.json({ ok: false, error: "Manca 'to'" }, { status: 400 });

    const result = await sendWhatsAppOrder({
      toPhones: [to],
      body: msg,
      mediaUrl: null,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore" }, { status: 500 });
  }
}
