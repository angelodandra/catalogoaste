import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import PDFDocument from "pdfkit";

export const runtime = "nodejs";

async function fetchAsBuffer(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Immagine non raggiungibile: ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function pdfToBuffer(doc: PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function eur(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  try {
    return `€ ${Number(n).toFixed(2)}`;
  } catch {
    return "—";
  }
}

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId mancante" }, { status: 400 });

    const supabase = supabaseServer();

    // 1) Ordine
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id,catalog_id,customer_name,customer_phone,owner_phone,created_at")
      .eq("id", orderId)
      .single();

    if (oErr) throw oErr;

    // 2) Righe ordine + prodotti (✅ include price_eur)
    const { data: items, error: iErr } = await supabase
      .from("order_items")
      .select("qty, products(id, progressive_number, box_number, image_path, price_eur)")
      .eq("order_id", orderId);

    if (iErr) throw iErr;

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const logoUrl = `${process.env.APP_BASE_URL}/logo.jpg`;

    // 3) PDF
    const doc = new PDFDocument({ size: "A4", margin: 40 });

    // Logo centrato
    try {
      const logoBuf = await fetchAsBuffer(logoUrl);
      doc.image(logoBuf, (doc.page.width - 160) / 2, 30, { width: 160 });
      doc.moveDown(3);
    } catch {
      doc.fontSize(18).text("Ordine", { align: "center" });
      doc.moveDown(1);
    }

    doc.fontSize(14).text("Riepilogo ordine", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(10);
    doc.text(`Ordine ID: ${order.id}`);
    doc.text(`Cliente: ${order.customer_name}`);
    doc.text(`Telefono: ${order.customer_phone}`);
    doc.text(`Data: ${new Date(order.created_at).toLocaleString("it-IT")}`);
    doc.moveDown(1);

    doc.fontSize(11).text("Prodotti:", { underline: true });
    doc.moveDown(0.5);

    let total = 0;

    for (const it of items || []) {
      const p = (it as any).products;
      if (!p) continue;

      const qty = Number((it as any).qty ?? 1);
      const price = p.price_eur === null || p.price_eur === undefined ? null : Number(p.price_eur);
      if (price !== null && Number.isFinite(price)) total += price * qty;

      const imgUrl = `${base}/storage/v1/object/public/catalog-images/${p.image_path}`;
      const yStart = doc.y;

      // immagine prodotto
      try {
        const imgBuf = await fetchAsBuffer(imgUrl);
        doc.image(imgBuf, 40, yStart, { width: 70, height: 70, fit: [70, 70] });
      } catch {
        // immagine non raggiungibile: salto
      }

      const xText = 40 + 85;

      // Riga principale: Prog, Cassa, Prezzo
      doc.fontSize(11).text(
        `Prog: ${p.progressive_number}   |   Cassa: ${p.box_number}   |   Prezzo: ${eur(price)}`,
        xText,
        yStart
      );

      // Quantità + subtotale
      const subtotal = price !== null && Number.isFinite(price) ? price * qty : null;
      doc.fontSize(10)
        .fillColor("gray")
        .text(`Quantità: ${qty}${subtotal !== null ? `   |   Subtotale: ${eur(subtotal)}` : ""}`, xText, yStart + 18);

      doc.fillColor("black");
      doc.moveDown(4);

      if (doc.y > 740) doc.addPage();
    }

    doc.moveDown(1);
    doc.fontSize(11).text(`Totale (stimato): ${eur(total)}`, { align: "right" });
    doc.moveDown(0.5);

    doc.fontSize(9).fillColor("gray").text("Documento generato automaticamente.", { align: "center" });
    doc.fillColor("black");

    const pdfBuffer = await pdfToBuffer(doc);

    // 4) Upload su bucket order-pdfs
    const pdfPath = `orders/${order.id}.pdf`;

    const { error: upErr } = await supabase.storage
      .from("order-pdfs")
      .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from("order-pdfs").getPublicUrl(pdfPath);

    return NextResponse.json({ ok: true, pdfPath, pdfPublicUrl: pub.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
