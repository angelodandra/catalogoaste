import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import PDFDocument from "pdfkit";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

// ─── helpers ────────────────────────────────────────────────────────────────

function nowIT() {
  return new Date().toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function fmtKg(v: number | null) {
  if (v == null) return "—";
  return v.toFixed(2).replace(".", ",") + " kg";
}

function fmtEur(v: number | null) {
  if (v == null) return "—";
  return v.toFixed(2).replace(".", ",") + " €/kg";
}

async function pdfToBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 36, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  build(doc);
  doc.end();
  return done;
}

// Usable page width: A4 595pt − 2×36 = 523pt
const MARGIN = 36;
const PAGE_W = 595;
const PW = PAGE_W - MARGIN * 2;  // 523
const PAGE_H = 841;
const BOTTOM_LIMIT = PAGE_H - MARGIN - 30;

function pageHeader(doc: PDFKit.PDFDocument, title: string, sub: string) {
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#000")
    .text(title, MARGIN, MARGIN + 4, { width: PW, align: "center" });
  doc.font("Helvetica").fontSize(10).fillColor("#333")
    .text(sub, MARGIN, doc.y + 2, { width: PW, align: "center" });
  doc.font("Helvetica").fontSize(8).fillColor("#888")
    .text(`Stampato il ${nowIT()}`, MARGIN, doc.y + 2, { width: PW, align: "center" });
  doc.moveDown(0.6);
}

function hRule(doc: PDFKit.PDFDocument, color = "#cccccc") {
  const y = doc.y;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + PW, y).lineWidth(0.5).stroke(color);
  doc.moveDown(0.35);
}

// Draw a single text cell at absolute (x, y) without advancing the cursor
function cell(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  w: number,
  opts?: { bold?: boolean; align?: "left" | "right" | "center"; color?: string; size?: number }
) {
  const { bold, align = "left", color = "#000000", size = 9 } = opts ?? {};
  doc.font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(size)
    .fillColor(color);
  doc.text(text, x, y, { width: w, align, lineBreak: false });
}

// ─── types ───────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  progressive_number: number;
  box_number: string | null;
  numero_interno_cassa: string | null;
  specie: string | null;
  peso_interno_kg: number | null;
  price_eur: number | null;
};

// ─── individual list ─────────────────────────────────────────────────────────

const COL_PROG   = 32;
const COL_SPECIE = 185;
const COL_PESO   = 80;
const COL_PREZZO = 82;
const COL_GAP    = 12;  // spazio visivo tra Prezzo e Cassa
const COL_CASSA  = PW - COL_PROG - COL_SPECIE - COL_PESO - COL_PREZZO - COL_GAP; // 132

const ROW_H = 17;

function tableHeader(doc: PDFKit.PDFDocument) {
  const y = doc.y;
  doc.rect(MARGIN, y, PW, ROW_H).fill("#f0f0f0");
  doc.fillColor("#000");

  let x = MARGIN;
  cell(doc, "Prog.",     x, y + 4, COL_PROG,   { bold: true });  x += COL_PROG;
  cell(doc, "Specie",    x, y + 4, COL_SPECIE, { bold: true });  x += COL_SPECIE;
  cell(doc, "Peso int.", x, y + 4, COL_PESO,   { bold: true, align: "right" }); x += COL_PESO;
  cell(doc, "Prezzo",    x, y + 4, COL_PREZZO, { bold: true, align: "right" }); x += COL_PREZZO + COL_GAP;
  cell(doc, "N° coop",   x, y + 4, COL_CASSA,  { bold: true });

  doc.y = y + ROW_H + 2;
}

function tableRow(doc: PDFKit.PDFDocument, p: Product, idx: number) {
  const y = doc.y;
  if (idx % 2 === 1) {
    doc.rect(MARGIN, y, PW, ROW_H).fill("#f9f9f9");
  }
  doc.fillColor("#000");

  // Solo il numero coop tra parentesi; fallback al box_number
  const cassa = p.numero_interno_cassa ? `(${p.numero_interno_cassa})` : (p.box_number ?? "—");

  let x = MARGIN;
  cell(doc, String(p.progressive_number), x, y + 3, COL_PROG);  x += COL_PROG;
  cell(doc, p.specie || "—",              x, y + 3, COL_SPECIE); x += COL_SPECIE;
  cell(doc, fmtKg(p.peso_interno_kg),     x, y + 3, COL_PESO,   { align: "right" }); x += COL_PESO;
  cell(doc, fmtEur(p.price_eur),          x, y + 3, COL_PREZZO, { align: "right" }); x += COL_PREZZO + COL_GAP;
  cell(doc, cassa,                        x, y + 3, COL_CASSA);

  doc.y = y + ROW_H;
}

function buildIndividualPdf(doc: PDFKit.PDFDocument, products: Product[], catalogName: string) {
  pageHeader(doc, "LISTINO PREZZI", catalogName);
  tableHeader(doc);

  for (let i = 0; i < products.length; i++) {
    if (doc.y + ROW_H > BOTTOM_LIMIT) {
      doc.addPage();
      pageHeader(doc, "LISTINO PREZZI (segue)", catalogName);
      tableHeader(doc);
    }
    tableRow(doc, products[i], i);
  }

  hRule(doc);
  const totKg = products.reduce((s, p) => s + (p.peso_interno_kg ?? 0), 0);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000")
    .text(`Totale: ${products.length} casse  —  ${totKg.toFixed(2).replace(".", ",")} kg`, MARGIN, doc.y + 4);
}

// ─── grouped list ─────────────────────────────────────────────────────────────

type Group = {
  specie: string;
  price_eur: number | null;
  items: Product[];
  totalKg: number;
};

function buildGroupedPdf(doc: PDFKit.PDFDocument, products: Product[], catalogName: string) {
  pageHeader(doc, "LISTINO PREZZI PER SPECIE", catalogName);

  // Build groups by specie+price key
  const groupMap = new Map<string, Group>();
  for (const p of products) {
    const specie = p.specie?.trim() || "N/D";
    const key = `${specie}||${p.price_eur ?? ""}`;
    if (!groupMap.has(key)) groupMap.set(key, { specie, price_eur: p.price_eur, items: [], totalKg: 0 });
    const g = groupMap.get(key)!;
    g.items.push(p);
    g.totalKg += p.peso_interno_kg ?? 0;
  }

  // Sort: by specie name asc, then by price desc within same specie
  const groups = [...groupMap.values()].sort((a, b) => {
    const sc = a.specie.localeCompare(b.specie, "it");
    if (sc !== 0) return sc;
    return (b.price_eur ?? 0) - (a.price_eur ?? 0);
  });

  const GROUP_H   = 22;  // height for group title row
  const ITEM_H    = 15;  // height for each item row
  const SUMMARY_H = 15;  // height for the summary row

  for (const g of groups) {
    const needed = GROUP_H + g.items.length * ITEM_H + SUMMARY_H + 10;
    if (doc.y + Math.min(needed, GROUP_H + ITEM_H * 2) > BOTTOM_LIMIT) {
      doc.addPage();
      pageHeader(doc, "LISTINO PREZZI PER SPECIE (segue)", catalogName);
    }

    // Group title bar
    const gy = doc.y;
    doc.rect(MARGIN, gy, PW, GROUP_H).fill("#1a1a1a");
    const groupLabel = p_eur_str(g);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#ffffff")
      .text(groupLabel, MARGIN + 8, gy + 5, { width: PW - 16, lineBreak: false });
    doc.y = gy + GROUP_H + 2;

    // Item rows
    for (let i = 0; i < g.items.length; i++) {
      if (doc.y + ITEM_H > BOTTOM_LIMIT) {
        doc.addPage();
        pageHeader(doc, "LISTINO PREZZI PER SPECIE (segue)", catalogName);
        doc.font("Helvetica").fontSize(9).fillColor("#333");
      }
      const p = g.items[i];
      const iy = doc.y;

      if (i % 2 === 1) doc.rect(MARGIN, iy, PW, ITEM_H).fill("#f5f5f5");
      doc.fillColor("#000");

      let cassa = p.box_number ? `Cassa ${p.box_number}` : `Prog. ${p.progressive_number}`;
      if (p.numero_interno_cassa) cassa += `  (coop ${p.numero_interno_cassa})`;

      cell(doc, cassa,                    MARGIN + 12, iy + 3, 200);
      cell(doc, fmtKg(p.peso_interno_kg), MARGIN + 220, iy + 3, 100, { align: "right" });
      // Repeat price per item for clarity if group has mixed prices (shouldn't happen but safe)
      if (p.price_eur !== g.price_eur) {
        cell(doc, fmtEur(p.price_eur), MARGIN + 330, iy + 3, 90, { color: "#666" });
      }

      doc.y = iy + ITEM_H;
    }

    // Summary row
    const sy = doc.y;
    doc.rect(MARGIN, sy, PW, SUMMARY_H).fill("#e8e8e8");
    doc.fillColor("#000");
    const summaryText =
      `${g.items.length} ${g.items.length === 1 ? "cassa" : "casse"}  —  totale ${g.totalKg.toFixed(2).replace(".", ",")} kg`;
    doc.font("Helvetica-Bold").fontSize(9)
      .text(summaryText, MARGIN + PW - 200, sy + 3, { width: 192, align: "right", lineBreak: false });
    doc.y = sy + SUMMARY_H + 6;
  }

  // Grand total
  hRule(doc, "#000000");
  const grandKg = products.reduce((s, p) => s + (p.peso_interno_kg ?? 0), 0);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000")
    .text(
      `Totale complessivo: ${products.length} casse  —  ${grandKg.toFixed(2).replace(".", ",")} kg`,
      MARGIN, doc.y + 4
    );
}

function p_eur_str(g: Group): string {
  return g.price_eur != null
    ? `${g.specie.toUpperCase()}   —   ${fmtEur(g.price_eur)}`
    : g.specie.toUpperCase();
}

// ─── handler ─────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const catalogId = url.searchParams.get("catalogId") ?? "";
    const mode = (url.searchParams.get("mode") ?? "individual") as "individual" | "grouped";

    if (!catalogId) return NextResponse.json({ error: "catalogId mancante" }, { status: 400 });

    const supabase = supabaseServer();

    const { data: cat } = await supabase
      .from("catalogs")
      .select("name, created_at")
      .eq("id", catalogId)
      .single();

    // Header: "Nome catalogo — GG/MM/AAAA"
    const datePart = cat?.created_at
      ? new Date(cat.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "";
    const rawName = cat?.name && cat.name.trim() ? cat.name.trim() : null;
    const catalogName = rawName
      ? `${rawName}${datePart ? "  —  " + datePart : ""}`
      : datePart || catalogId;

    const { data: prods, error } = await supabase
      .from("products")
      .select("id, progressive_number, box_number, numero_interno_cassa, specie, peso_interno_kg, price_eur")
      .eq("catalog_id", catalogId)
      .order("progressive_number", { ascending: true });

    if (error) throw error;
    const products = (prods ?? []) as Product[];

    if (products.length === 0)
      return NextResponse.json({ error: "Nessun prodotto nel catalogo" }, { status: 400 });

    const pdfBuf = await pdfToBuffer((doc) => {
      if (mode === "grouped") buildGroupedPdf(doc, products, catalogName);
      else buildIndividualPdf(doc, products, catalogName);
    });

    const filename = mode === "grouped"
      ? `listino-specie-${catalogId.slice(0, 8)}.pdf`
      : `listino-${catalogId.slice(0, 8)}.pdf`;

    return new Response(pdfBuf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
