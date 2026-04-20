import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import PDFDocument from "pdfkit";

import { requireAdmin } from "@/lib/requireAdmin";

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

function pdfToBuffer(doc: any) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
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

// Estrae YYYY-MM-DD da un timestamp ISO (in fuso locale italiano)
function dayKey(iso: string) {
  try {
    const d = new Date(iso);
    // Usa toLocaleDateString IT con anno-mese-giorno per ordinamento alfabetico = cronologico
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return iso?.slice(0, 10) || "";
  }
}

function dayLabel(key: string) {
  // "2026-04-20" → "Lunedì 20 aprile 2026"
  if (!key) return "";
  try {
    const d = new Date(`${key}T12:00:00`);
    return d.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return key;
  }
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const from = safeStr(url.searchParams.get("from")).trim(); // YYYY-MM-DD
    const to = safeStr(url.searchParams.get("to")).trim();     // YYYY-MM-DD
    const orderIdsParam = url.searchParams.getAll("orderIds").flatMap(s => s.split(",")).map(s => s.trim()).filter(Boolean);

    const supabase = supabaseServer();

    let q = supabase
      .from("orders")
      .select("id,customer_name,customer_phone,created_at,status")
      .order("created_at", { ascending: true })
      .limit(2000);

    if (orderIdsParam.length > 0) {
      q = q.in("id", orderIdsParam);
    }
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
      .select("order_id,qty,products(id,box_number,image_path,price_eur,weight_kg,peso_interno_kg,specie,numero_interno_cassa,catalogs(title,online_title))")
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

    // ── Helper di rendering ────────────────────────────────────────────────
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

    const drawCustomerHeader = (customerName: string, company: string, dateRangeLabel: string) => {
      const customerLine = `${customerName}${company ? ` (${company})` : ""}`;
      doc.font("Helvetica-Bold").fontSize(14).fillColor("black")
        .text(customerLine, left, doc.y, { width: usableW, lineBreak: false });
      doc.font("Helvetica").fontSize(9).fillColor("gray")
        .text(dateRangeLabel, left, doc.y + 2, { width: usableW, lineBreak: false });
      doc.fillColor("black");
      // riga sotto
      const ySep = doc.y + 6;
      doc.strokeColor("#000000").lineWidth(1.5);
      doc.moveTo(left, ySep).lineTo(left + usableW, ySep).stroke();
      doc.strokeColor("#000000").lineWidth(1);
      doc.y = ySep + 8;
    };

    const drawDaySubheader = (dayStr: string, count: number) => {
      const boxH = 22;
      // Verifica spazio: se non ce n'è, vai a nuova pagina
      if (doc.y + boxH + 8 > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
      }
      // Pillola colorata con la data (senza emoji — Helvetica di pdfkit non le supporta)
      const text = `${dayLabel(dayStr).toUpperCase()}  ·  ${count} ${count === 1 ? "cassa" : "casse"}`;
      const yBox = doc.y;
      doc.rect(left, yBox, usableW, boxH).fillAndStroke("#f3f4f6", "#d1d5db");
      doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10)
        .text(text, left + 10, yBox + 6, { width: usableW - 20, lineBreak: false });
      doc.fillColor("black").font("Helvetica");
      doc.y = yBox + boxH + 6;
    };

    const drawRow = async (r: any) => {
      const lineH = 86;
      const thumb = 70;
      const checkboxSize = 14;

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
          doc.fontSize(9).fillColor("gray").text("foto n/d", imgX + 18, imgY + 25, { align: "center" });
          doc.fillColor("black");
        }
      } else {
        doc.fontSize(9).fillColor("gray").text("foto mancante", imgX + 10, imgY + 25, { align: "center" });
        doc.fillColor("black");
      }

      const xText = imgX + thumb + 14;

      const numCoopLabelBulk = r.numero_interno_cassa != null ? `   N° coop: ${r.numero_interno_cassa}` : "";
      const titleLineBulk = `Cassa ${r.box}${numCoopLabelBulk}${r.specie ? `   ${r.specie.toUpperCase()}` : ""}`;
      doc.font("Helvetica-Bold").fontSize(14).text(titleLineBulk, xText, y + 6);

      doc.font("Helvetica").fontSize(10).fillColor("gray");
      doc.text(
        `Qtà: ${r.qty}${r.internal_weight !== null && r.internal_weight !== undefined ? `   |   Peso int: ${Number(r.internal_weight).toFixed(2)} kg` : ""}${r.weight_kg !== null && r.weight_kg !== undefined ? `   |   Peso: ≈ ${Number(r.weight_kg).toFixed(2)} kg` : ""}${r.prov ? `   |   ${r.prov}` : ""}`,
        xText,
        y + 30
      );
      doc.text(`Prezzo: ${eur(r.price)}`, xText, y + 46);
      doc.fillColor("black");

      doc.strokeColor("#e5e5e5").lineWidth(1);
      doc.moveTo(left, y + lineH).lineTo(left + usableW, y + lineH).stroke();
      doc.strokeColor("#000000").lineWidth(1);

      doc.y = y + lineH + 6;
    };

    // ── Costruzione dati ───────────────────────────────────────────────────
    const itemsByOrder: Record<string, any[]> = {};
    for (const it of items) {
      const orderId = safeStr(it.order_id).trim();
      if (!itemsByOrder[orderId]) itemsByOrder[orderId] = [];
      const p = it.products;
      const prodCatalog = Array.isArray(p?.catalogs) ? p.catalogs[0] : p?.catalogs;
      const prov = prodCatalog?.online_title || prodCatalog?.title || "";

      itemsByOrder[orderId].push({
        productId: safeStr(p?.id ?? ""),
        qty: Number(it.qty ?? 1),
        box: safeStr(p?.box_number ?? "?"),
        image_path: safeStr(p?.image_path ?? ""),
        price: p?.price_eur ?? null,
        weight_kg: p?.weight_kg ?? null,
        internal_weight: p?.peso_interno_kg ?? null,
        numero_interno_cassa: p?.numero_interno_cassa ?? null,
        specie: (p?.specie || "").toString().trim(),
        prov,
      });
    }

    // Raggruppa per cliente, poi per giorno
    type DayBlock = { day: string; rows: any[] };
    type CustomerGroup = {
      customer_name: string;
      customer_phone: string;
      company: string;
      created_min: string;
      created_max: string;
      days: Record<string, any[]>;
      seenProductIds: Set<string>;
      seenBoxes: Set<string>;
    };

    const groups: Record<string, CustomerGroup> = {};

    for (const o of orders) {
      const phone = safeStr(o.customer_phone).trim();
      const name = safeStr(o.customer_name).trim();
      if (!phone && !name) continue;

      const key = `${name}__${phone}`;
      const company = companyByPhone[phone] || "";
      const created = safeStr(o.created_at);
      const dKey = dayKey(created);

      if (!groups[key]) {
        groups[key] = {
          customer_name: name || phone,
          customer_phone: phone,
          company,
          created_min: created,
          created_max: created,
          days: {},
          seenProductIds: new Set<string>(),
          seenBoxes: new Set<string>(),
        };
      } else {
        if (!groups[key].customer_name && name) groups[key].customer_name = name;
        if (!groups[key].company && company) groups[key].company = company;
        if (created && created < groups[key].created_min) groups[key].created_min = created;
        if (created && created > groups[key].created_max) groups[key].created_max = created;
      }

      const rows = itemsByOrder[safeStr(o.id).trim()] || [];

      for (const r of rows) {
        // Dedup per cliente: stesso prodotto in ordini diversi viene contato una volta sola
        const pid = String(r.productId || "").trim();
        const box = String(r.box || "").trim();
        if (pid) {
          if (groups[key].seenProductIds.has(pid)) continue;
          groups[key].seenProductIds.add(pid);
        } else if (box) {
          if (groups[key].seenBoxes.has(box)) continue;
          groups[key].seenBoxes.add(box);
        }
        if (!groups[key].days[dKey]) groups[key].days[dKey] = [];
        groups[key].days[dKey].push(r);
      }
    }

    // ordina + dedup per cliente
    const groupedArr = Object.values(groups);

    for (const g of groupedArr) {
      // sort dei giorni (chiave alfabetica YYYY-MM-DD = cronologica)
      // sort delle righe per box dentro ogni giorno
      for (const k of Object.keys(g.days)) {
        g.days[k].sort((a: any, b: any) => Number(a.box) - Number(b.box));
      }
    }

    // ordina clienti per nome
    groupedArr.sort((a, b) => (a.customer_name || "").localeCompare(b.customer_name || ""));

    const rangeLabel = from && to ? `${from} → ${to}` : "tutti";
    await drawTop("Preparazione merce (cumulativo)", `Stampa: ${nowIT()}  |  Periodo: ${rangeLabel}`);

    for (let i = 0; i < groupedArr.length; i++) {
      const g = groupedArr[i];
      const dayKeys = Object.keys(g.days).sort();
      const totalRows = dayKeys.reduce((acc, dk) => acc + g.days[dk].length, 0);
      if (!totalRows) continue;

      // Header cliente
      const dateRangeText = dayKeys.length === 1
        ? `Giorno: ${dayLabel(dayKeys[0])}`
        : `Periodo: ${dayLabel(dayKeys[0])} → ${dayLabel(dayKeys[dayKeys.length - 1])}  ·  ${dayKeys.length} giorni`;
      drawCustomerHeader(g.customer_name, g.company, dateRangeText);

      // Sezioni per giorno (con prezzo e pesi per prodotto, nessun totale)
      for (const dk of dayKeys) {
        const dayRows = g.days[dk];
        drawDaySubheader(dk, dayRows.length);
        for (const r of dayRows) {
          await drawRow(r);
        }
      }

      // Pagina nuova tra clienti (tranne ultimo)
      if (i < groupedArr.length - 1) {
        doc.addPage();
      }
    }

    doc.font("Helvetica").fontSize(9).fillColor("gray").text(
      "Spunte: usa la casella a sinistra per segnare la cassa preparata.",
      left,
      doc.page.height - doc.page.margins.bottom - 10,
      { width: usableW, align: "center" }
    );
    doc.fillColor("black");

    doc.end();

    const pdfBuffer = await pdfPromise;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="prep-cumulativo.pdf"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
