import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  const from = process.env.TWILIO_WHATSAPP_FROM || "";
  return NextResponse.json({
    sid_preview: sid ? `${sid.slice(0, 6)}...${sid.slice(-6)}` : null,
    token_length: token.length,
    from,
  });
}
