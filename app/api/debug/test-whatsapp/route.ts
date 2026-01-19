import { NextResponse } from "next/server";
import { sendWhatsAppOrder } from "@/lib/twilioSend";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { to } = await req.json();
    if (!to) return NextResponse.json({ error: "to mancante" }, { status: 400 });

    const result = await sendWhatsAppOrder({
      toPhones: [to],
      body: "✅ Test WhatsApp dal tuo catalogo — se leggi questo, Twilio funziona!",
      mediaUrl: null,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "Errore" }, { status: 500 });
  }
}
