/**
 * Meta WhatsApp Cloud API - invio messaggi WhatsApp tramite API ufficiale Meta.
 * Documentazione: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 *
 * Variabili d'ambiente necessarie:
 *   META_WA_ACCESS_TOKEN   — Token permanente del System User
 *   META_WA_PHONE_ID       — Phone Number ID (es. 1104491812742918)
 */

const API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

/** Normalizza un numero di telefono in formato internazionale senza + (es. "393487680298") */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^00/, "");
}

type MetaTextMessage = {
  type: "text";
  to: string;
  body: string;
};

type MetaDocumentMessage = {
  type: "document";
  to: string;
  documentUrl: string;
  filename?: string;
  caption?: string;
};

type MetaSendMessage = MetaTextMessage | MetaDocumentMessage;

async function sendOneMessage(msg: MetaSendMessage): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.META_WA_ACCESS_TOKEN || "";
  const phoneId = process.env.META_WA_PHONE_ID || "";

  if (!token || !phoneId) {
    throw new Error("META_WA_ACCESS_TOKEN e META_WA_PHONE_ID non configurati");
  }

  const to = normalizePhone(msg.to);
  if (!to) throw new Error("Numero di telefono non valido");

  let payload: any;

  if (msg.type === "text") {
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: msg.body, preview_url: false },
    };
  } else {
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: {
        link: msg.documentUrl,
        filename: msg.filename || "documento.pdf",
        caption: msg.caption || "",
      },
    };
  }

  const res = await fetch(`${BASE_URL}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
    return { ok: false, error: errMsg };
  }

  return { ok: true };
}

/**
 * Invia un messaggio testuale WhatsApp a uno o più numeri.
 */
export async function sendMetaWhatsAppText(opts: {
  toPhones: string[];
  body: string;
}): Promise<{ ok: number; failed: number; failures: string[] }> {
  const results = await Promise.allSettled(
    opts.toPhones.filter(Boolean).map((phone) =>
      sendOneMessage({ type: "text", to: phone, body: opts.body })
    )
  );

  const failures: string[] = [];
  let ok = 0;

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) {
      ok++;
    } else {
      const errMsg =
        r.status === "rejected"
          ? String(r.reason?.message || r.reason)
          : r.value.error || "invio fallito";
      failures.push(errMsg);
    }
  }

  return { ok, failed: failures.length, failures };
}

/**
 * Invia un documento PDF WhatsApp a uno o più numeri,
 * con un testo di caption opzionale.
 * Richiede che il PDF abbia un URL pubblico accessibile da Meta.
 */
export async function sendMetaWhatsAppDocument(opts: {
  toPhones: string[];
  documentUrl: string;
  filename?: string;
  caption?: string;
}): Promise<{ ok: number; failed: number; failures: string[] }> {
  const results = await Promise.allSettled(
    opts.toPhones.filter(Boolean).map((phone) =>
      sendOneMessage({
        type: "document",
        to: phone,
        documentUrl: opts.documentUrl,
        filename: opts.filename,
        caption: opts.caption,
      })
    )
  );

  const failures: string[] = [];
  let ok = 0;

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) {
      ok++;
    } else {
      const errMsg =
        r.status === "rejected"
          ? String(r.reason?.message || r.reason)
          : r.value.error || "invio fallito";
      failures.push(errMsg);
    }
  }

  return { ok, failed: failures.length, failures };
}

/**
 * Invia prima un testo e poi (se disponibile) un documento PDF allegato.
 * Utile per: invia messaggio di riepilogo + PDF allegato separatamente.
 */
export async function sendMetaWhatsAppOrder(opts: {
  toPhones: string[];
  body: string;
  pdfUrl?: string | null;
  pdfFilename?: string;
}): Promise<{ ok: number; failed: number; failures: string[] }> {
  // 1) Invia testo
  const textResult = await sendMetaWhatsAppText({
    toPhones: opts.toPhones,
    body: opts.body,
  });

  // 2) Se c'è un PDF con URL pubblico, invialo come documento
  if (opts.pdfUrl && !opts.pdfUrl.includes("localhost") && !opts.pdfUrl.includes("127.0.0.1")) {
    // Non bloccare se il documento fallisce (è un extra)
    try {
      await sendMetaWhatsAppDocument({
        toPhones: opts.toPhones,
        documentUrl: opts.pdfUrl,
        filename: opts.pdfFilename || "ordine.pdf",
        caption: "📄 Riepilogo ordine",
      });
    } catch {
      // Non critico
    }
  }

  return textResult;
}
