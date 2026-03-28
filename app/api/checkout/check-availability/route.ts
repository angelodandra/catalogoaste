import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { productIds } = await req.json();

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: "productIds richiesti" }, { status: 400 });
    }

    const { data: products, error } = await supabase
      .from("products")
      .select("id, box_number, progressive_number, is_sold")
      .in("id", productIds);

    if (error) throw error;

    const sold = (products || [])
      .filter((p) => p.is_sold)
      .map((p) => ({
        productId: p.id,
        label: `Cassa ${p.box_number} (Prog. ${p.progressive_number})`,
      }));

    const available = (products || [])
      .filter((p) => !p.is_sold)
      .map((p) => p.id);

    return NextResponse.json({ sold, available });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
