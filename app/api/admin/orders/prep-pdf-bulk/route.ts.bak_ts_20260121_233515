import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import PDFDocument from "pdfkit";

export const runtime = "nodejs";

function safeStr(v: any) {
  return (v ?? "").toString();
}


async function fetchAsBuffer(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch fallito: ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function pdfToBuffer(doc: PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function nowIT() {
  return new Date().toLocaleString("it-IT");
}

function eur(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `€ ${v.toFixed(2)}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = safeStr(url.searchParams.get("from")).trim(); // YYYY-MM-DD
    const to = safeStr(url.searchParams.get("to")).trim();     // YYYY-MM-DD

    const supabase = supabaseServer();

    let q = supabase
      .from("orders")
      .select("id,customer_name,customer_phone,created_at,status")
      .order("created_at", { ascending: true })
      .limit(2000);

    if (from && to) {
      q = q.gte("created_at", `${from}T00:00:00Z`).lte("created_at", `${to}T23:59:59Z`);
    }

    const { data: ordersData, error: oErr } = await q;
    if (oErr) throw oErr;

    const orders = (ordersData || []) as any[];

    if (!orders.length) {
      return new NextResponse("Nessun ordine nel periodo selezionato", { status: 404 });
    }

    const orderIds = orders.map((o) => o.id);

    const { data: itemsData, error: iErr } = await supabase
      .from("order_items")
      .select("order_id,qty,products(id,box_number,image_path,price_eur)")
      .in("order_id", orderIds);

    if (iErr) throw iErr;

    const items = (itemsData || []) as any[];

    const phones = Array.from(new Set(orders.map((o) => safeStr(o.customer_phone).trim()).filter(Boolean)));

    const companyByPhone: Record<string, string> = {};
    if (phones.length) {
      const { data: custs, error: cErr } = await supabase
        .from("customers")
        .select("phone,company")
        .in("phone", phones);

      if (cErr) throw cErr;

      for (const c of (custs || []) as any[]) {
        companyByPhone[safeStr(c.phone).trim()] = safeStr(c.company).trim();
      }
    }

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const appBase = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
    const logoUrl = `${appBase}/logo.jpg`;

    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const pdfPromise = pdfToBuffer(doc);

    const pageW = doc.page.width;
    const left = doc.page.margins.left;
    const right = doc.page.margins.right;
    const usableW = pageW - left - right;

    const drawTop = async (title: string, subtitle: string) => {
      const startY = 24;
      try {
        const logoBuf = await fetchAsBuffer(logoUrl);
        doc.image(logoBuf, (pageW - 160) / 2, startY, { width: 160 });
      } catch {
        doc.fontSize(18).font("Helvetica-Bold").text("F.lli D'Andrassi", { align: "center" });
      }

      doc.y = startY + 90;
      doc.font("Helvetica-Bold").fontSize(16).text(title, { align: "center" });
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).fillColor("gray").text(subtitle, { align: "center" });
      doc.fillColor("black");
      doc.moveDown(0.8);
      doc.moveTo(left, doc.y).lineTo(left + usableW, doc.y).strokeColor("#cccccc").stroke();
      doc.moveDown(0.8);
    };

    const drawOrderBlock = async (order: any, rows: any[]) => {
      const phone = safeStr(order.customer_phone).trim();
      const company = companyByPhone[phone] || "";
      const customerLine = `${safeStr(order.customer_name).trim()}${company ? ` (${company})` : ""}`;

      doc.font("Helvetica-Bold").fontSize(13).text(customerLine);
      doc.font("Helvetica").fontSize(10).fillColor("gray").text(`Creato il: ${new Date(order.created_at).toLocaleString("it-IT")}`);
      doc.fillColor("black");
      doc.moveDown(0.4);

      const lineH = 86;
      const thumb = 70;
      const checkboxSize = 14;

      let total = 0;

      for (const r of rows) {
        if (doc.y + lineH > doc.page.height - doc.page.margins.bottom - 20) {
          doc.addPage();
        }

        const y = doc.y;

        doc.rect(left, y + 6, checkboxSize, checkboxSize).strokeColor("#000000").stroke();

        const imgX = left + 26;
        const imgY = y;
        const imgUrl = r.image_path ? `${base}/storage/v1/object/public/catalog-images/${r.image_path}` : "";

        if (imgUrl) {
          try {
            const imgBuf = await fetchAsBuffer(imgUrl);
            doc.image(imgBuf, imgX, imgY, { width: thumb, height: thumb, fit: [thumb, thumb] });
          } catch {
            doc.fontSize(9).fillColor("gray").text("foton/d", imgX + 18, imgY + 25, { align: "center" });
            doc.fillColor("black");
          }
        } else {
          doc.fontSize(9).fillColor("gray").text("fotomancante", imgX + 10, imgY + 25, { align: "center" });
          doc.fillColor("black");
        }

        const xText = imgX + thumb + 14;

        doc.font("Helvetica-Bold").fontSize(14).text(`Cassa ${r.box}`, xText, y + 6);

        doc.font("Helvetica").fontSize(10).fillColor("gray");
        doc.text(`Quantità: ${r.qty}`, xText, y + 30);

        const price = r.price === null || r.price === undefined ? null : Number(r.price);
        const subtotal = price !== null && Number.isFinite(price) ? price * r.qty : null;
        doc.text(`Prezzo: ${eur(price)}${subtotal !== null ? `  |  Subtotale: ${eur(subtotal)}` : ""}`, xText, y + 46);
        doc.fillColor("black");

        if (subtotal !== null) total += subtotal;

        doc.strokeColor("#e5e5e5").lineWidth(1);
        doc.moveTo(left, y + lineH).lineTo(left + usableW, y + lineH).stroke();
        doc.strokeColor("#000000").lineWidth(1);

        doc.y = y + lineH + 6;
      }

      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(11).text(`Totale (stimato): ${eur(total)}`, { align: "right" });
      doc.moveDown(0.6);

      doc.strokeColor("#cccccc").lineWidth(1);
      doc.moveTo(left, doc.y).lineTo(left + usableW, doc.y).stroke();
      doc.strokeColor("#000000").lineWidth(1);
      doc.moveDown(0.8);
    };

    
    // ====== Raggruppa per CLIENTE (telefono) e unisce tutte le casse ======
    
    // ====== Raggruppa per CLIENTE (telefono) e unisce tutte le casse ======
    const itemsByOrder: Record<string, any[]> = {};
    for (const it of items) {
      const orderId = safeStr(it.order_id).trim();
      if (!itemsByOrder[orderId]) itemsByOrder[orderId] = [];
      const p = it.products;
      itemsByOrder[orderId].push({
        productId: safeStr(p?.id ?? ""),
        qty: Number(it.qty ?? 1),
        box: safeStr(p?.box_number ?? "?"),
        image_path: safeStr(p?.image_path ?? ""),
        price: p?.price_eur ?? null,
      });
    }

    // customerKey = telefono normalizzato
    const groups: Record<
      string,
      {
        customer_name: string;
        customer_phone: string;
        company: string;
        created_min: string;
        created_max: string;
        rows: any[];
      }
    > = {};

    for (const o of orders) {
      const phone = safeStr(o.customer_phone).trim();
      if (!phone) continue;

      const company = companyByPhone[phone] || "";
      const name = safeStr(o.customer_name).trim();
      const created = safeStr(o.created_at);

      if (!groups[phone]) {
        groups[phone] = {
          customer_name: name || phone,
          customer_phone: phone,
          company,
          created_min: created,
          created_max: created,
          rows: [],
        };
      } else {
        // aggiorna nome/company se mancanti
        if (!groups[phone].customer_name && name) groups[phone].customer_name = name;
        if (!groups[phone].company && company) groups[phone].company = company;
        // range date
        if (created && created < groups[phone].created_min) groups[phone].created_min = created;
        if (created && created > groups[phone].created_max) groups[phone].created_max = created;
      }

      const rows = itemsByOrder[safeStr(o.id).trim()] || [];
      groups[phone].rows.push(...rows);
    }

    // ordina + dedup per cliente
    const groupedArr = Object.values(groups);

    for (const g of groupedArr) {
      // sort per box
      g.rows.sort((a: any, b: any) => Number(a.box) - Number(b.box));

      // dedup: prima per productId, altrimenti per box
      const seenP = new Set<string>();
      const seenB = new Set<string>();
      g.rows = g.rows.filter((r: any) => {
        const pid = String(r.productId || "").trim();
        const box = String(r.box || "").trim();

        if (pid) {
          if (seenP.has(pid)) return false;
          seenP.add(pid);
          return true;
        }
        if (box) {
          if (seenB.has(box)) return false;
          seenB.add(box);
          return true;
        }
        return true;
      });
    }

    // ordina clienti per nome
    groupedArr.sort((a, b) => (a.customer_name || "").localeCompare(b.customer_name || ""));

const rangeLabel = from && to ? `${from} → ${to}` : "tutti";
    await drawTop("Preparazione merce (cumulativo)", `Stampa: ${nowIT()}  |  Periodo: ${rangeLabel}`);

    for (const g of groupedArr) {
      if (!g.rows.length) continue;
      // fingo "order" solo per riusare drawOrderBlock senza stravolgere tutto
      const fakeOrder: any = {
        customer_name: g.customer_name,
        customer_phone: g.customer_phone,
        created_at: g.created_min,
      };
      await drawOrderBlock(fakeOrder, g.rows);
    }

    doc.font("Helvetica").fontSize(9).fillColor("gray").text(
      "Spunte: usa la casella a sinistra per segnare la cassa preparata.",
      { align: "center" }
    );
    doc.fillColor("black");

    doc.end();

    const pdfBuffer = await pdfPromise;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="prep-cumulativo.pdf"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
