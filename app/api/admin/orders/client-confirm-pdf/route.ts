import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/requireAdmin";
import PDFDocument from "pdfkit";

export const runtime = "nodejs";

async function fetchAsBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function pdfToBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function safeStr(v: any) { return (v ?? "").toString(); }
function eur(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  return Number.isFinite(v) ? `€ ${v.toFixed(2)}` : "—";
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const orderIdsParam = url.searchParams.getAll("orderIds")
      .flatMap((s) => s.split(","))
      .map((s) => s.trim())
      .filter(Boolean);

    if (!orderIdsParam.length) {
      return new NextResponse("orderIds mancanti", { status: 400 });
    }

    const supabase = supabaseServer();

    // 1) Carica ordini
    const { data: ordersData, error: oErr } = await supabase
      .from("orders")
      .select("id,customer_name,customer_phone,created_at,catalog_id")
      .in("id", orderIdsParam)
      .order("created_at", { ascending: true });
    if (oErr) throw oErr;

    const orders = (ordersData || []) as any[];
    if (!orders.length) return new NextResponse("Nessun ordine trovato", { status: 404 });

    // 2) Carica items con dati prodotto orientati al cliente (NO peso interno, NO n° coop)
    const { data: itemsData, error: iErr } = await supabase
      .from("order_items")
      .select("order_id,qty,products(id,progressive_number,box_number,image_path,price_eur,weight_kg,catalogs(title,online_title))")
      .in("order_id", orderIdsParam);
    if (iErr) throw iErr;

    const items = (itemsData || []) as any[];

    // 3) Dati azienda cliente
    const phones = Array.from(new Set(orders.map((o) => safeStr(o.customer_phone).trim()).filter(Boolean)));
    const companyByPhone: Record<string, string> = {};
    if (phones.length) {
      const { data: custs } = await supabase.from("customers").select("phone,company").in("phone", phones);
      for (const c of (custs || []) as any[]) {
        companyByPhone[safeStr(c.phone).trim()] = safeStr(c.company).trim();
      }
    }

    // 4) Raggruppa items per ordine
    const itemsByOrder: Record<string, any[]> = {};
    for (const it of items) {
      const oid = safeStr(it.order_id).trim();
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(it);
    }

    // Dati cliente (primo ordine)
    const firstOrder = orders[0];
    const phone = safeStr(firstOrder.customer_phone).trim();
    const customerName = safeStr(firstOrder.customer_name).trim();
    const company = companyByPhone[phone] || "";

    const appBase = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
    const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const logoUrl = `${appBase}/logo.jpg`;

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const pageW = doc.page.width;
    const left = doc.page.margins.left;
    const right = doc.page.margins.right;
    const usableW = pageW - left - right;

    // ── Logo ──────────────────────────────────────────────────────────────
    const logoBuf = await fetchAsBuffer(logoUrl);
    if (logoBuf) {
      doc.image(logoBuf, (pageW - 160) / 2, 30, { width: 160 });
      doc.y = 110;
    } else {
      doc.fontSize(18).font("Helvetica-Bold").text("F.lli D'Andrassi", { align: "center" });
      doc.moveDown(1);
    }

    // ── Titolo ────────────────────────────────────────────────────────────
    const titleLabel = orders.length > 1 ? "Conferma ordini" : "Conferma ordine";
    doc.font("Helvetica-Bold").fontSize(16).text(titleLabel, { align: "center" });
    doc.moveDown(0.6);

    // ── Dati cliente ──────────────────────────────────────────────────────
    doc.font("Helvetica").fontSize(11);
    doc.text(`Cliente: ${customerName}${company ? ` (${company})` : ""}`);
    doc.text(`Telefono: ${phone}`);
    if (orders.length === 1) {
      doc.text(`Data: ${new Date(firstOrder.created_at).toLocaleString("it-IT")}`);
    } else {
      const latest = orders.reduce((a, b) => (a.created_at > b.created_at ? a : b));
      doc.text(`Data: ${new Date(latest.created_at).toLocaleString("it-IT")}`);
    }
    doc.moveDown(0.8);

    doc.moveTo(left, doc.y).lineTo(left + usableW, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.8);

    // ── Prodotti (tutti gli ordini uniti, senza dati interni) ─────────────
    doc.font("Helvetica-Bold").fontSize(12).text("Prodotti ordinati:", { underline: true });
    doc.moveDown(0.5);

    // Raccogli tutte le righe da tutti gli ordini e dedup per productId
    const allRows: any[] = [];
    const seenProductIds = new Set<string>();

    for (const order of orders) {
      const orderItems = itemsByOrder[order.id] || [];
      for (const it of orderItems) {
        const p = it.products;
        if (!p) continue;
        const pid = safeStr(p.id).trim();
        if (pid && seenProductIds.has(pid)) continue;
        if (pid) seenProductIds.add(pid);

        const prodCatalog = Array.isArray(p.catalogs) ? p.catalogs[0] : p.catalogs;
        const provenienza = prodCatalog?.online_title || prodCatalog?.title || "";

        allRows.push({
          progressive_number: p.progressive_number,
          box_number: p.box_number,
          image_path: safeStr(p.image_path),
          price_eur: p.price_eur ?? null,
          weight_kg: p.weight_kg ?? null,   // solo peso esterno
          qty: Number(it.qty ?? 1),
          provenienza,
        });
      }
    }

    // Ordina per numero cassa
    allRows.sort((a, b) => Number(a.box_number) - Number(b.box_number));

    // (totale rimosso: il valore finale viene calcolato in fattura)

    for (const r of allRows) {
      const imgUrl = r.image_path ? `${supabaseBase}/storage/v1/object/public/catalog-images/${r.image_path}` : "";
      const yStart = doc.y;

      // Immagine
      const imgBuf = imgUrl ? await fetchAsBuffer(imgUrl) : null;
      if (imgBuf) {
        doc.image(imgBuf, left, yStart, { width: 70, height: 70, fit: [70, 70] });
      }

      const xText = left + 85;

      // Riga principale
      const peso = r.weight_kg !== null && r.weight_kg !== undefined
        ? `${Number(r.weight_kg).toFixed(2)} kg`
        : "—";
      const prezzoTxt = r.price_eur !== null && r.price_eur !== undefined
        ? `${eur(r.price_eur)} /Kg`
        : "—";
      doc.font("Helvetica-Bold").fontSize(11).fillColor("black").text(
        `Prog: ${r.progressive_number}   |   Cassa: ${r.box_number}   |   Peso: ${peso}   |   Prezzo: ${prezzoTxt}`,
        xText,
        yStart
      );

      // Quantità + provenienza
      doc.font("Helvetica").fontSize(10).fillColor("gray").text(
        `Quantità: ${r.qty}${r.provenienza ? `   |   Provenienza: ${r.provenienza}` : ""}`,
        xText,
        yStart + 18
      );
      doc.fillColor("black");

      doc.y = yStart + 80;
      doc.moveTo(left, doc.y - 4).lineTo(left + usableW, doc.y - 4).strokeColor("#e5e5e5").lineWidth(1).stroke();
      doc.strokeColor("#000").lineWidth(1);

      if (doc.y > 720) doc.addPage();
    }

    // Nessun totale: il valore finale viene calcolato in fattura in base al
    // peso effettivo alla consegna (i prezzi mostrati sono €/Kg, non totali).

    doc.moveDown(1);
    doc.font("Helvetica").fontSize(9).fillColor("gray").text("Documento generato automaticamente.", { align: "center" });
    doc.fillColor("black");

    const pdfBuffer = await pdfToBuffer(doc);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="conferma-ordine.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
