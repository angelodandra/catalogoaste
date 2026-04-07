import { NextResponse } from "next/server";
import { requireAdmin, adminErrorResponse } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
  } catch (e: any) {
    return adminErrorResponse(e);
  }

  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  const from = process.env.TWILIO_WHATSAPP_FROM || "";
  return NextResponse.json({
    sid_preview: sid ? `${sid.slice(0, 6)}...${sid.slice(-6)}` : null,
    token_length: token.length,
    from,
  });
}
