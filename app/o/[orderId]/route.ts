import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { orderId: string } } | { params: Promise<{ orderId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const p: any = (ctx as any).params;
  const { orderId } = await Promise.resolve(p);

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return new NextResponse("Missing NEXT_PUBLIC_SUPABASE_URL", { status: 500 });

  const pdfUrl = `${base}/storage/v1/object/public/order-pdfs/orders/${orderId}.pdf`;
  return NextResponse.redirect(pdfUrl, 302);
}
