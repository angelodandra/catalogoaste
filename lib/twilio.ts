import Twilio from "twilio";

type SendOpts = {
  toPhones: string[];
  body: string;
  mediaUrl?: string | null;
};

function toWhatsApp(n: string) {
  if (!n) return "";
  // normalizza: rimuove eventuali prefissi duplicati
  const clean = n.replace(/^whatsapp:/g, "");
  if (clean.startsWith("+")) return `whatsapp:${clean}`;
  return `whatsapp:+${clean}`;
}

export async function sendWhatsAppOrder(opts: SendOpts) {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  const from = process.env.TWILIO_WHATSAPP_FROM || "";

  if (!sid || !token || !from) {
    throw new Error("Twilio non configurato correttamente");
  }

  const client = Twilio(sid, token);

  const mu = (opts.mediaUrl || "").trim();
  const isLocalUrl = !mu || mu.includes("localhost") || mu.includes("127.0.0.1") || mu.includes(".local");

  const body = !isLocalUrl && mu ? opts.body : mu ? `\n\nPDF: ` : opts.body;


  const results = await Promise.allSettled(
    opts.toPhones
      .filter(Boolean)
      .map((p) =>
        client.messages.create({
          from: toWhatsApp(from),
          to: toWhatsApp(p),
          body: body,
          ...(opts.mediaUrl ? { mediaUrl: [opts.mediaUrl] } : {}),
        })
      )
  );

  const successes = results
    .filter((r) => r.status === "fulfilled")
    .map((r: any) => ({ sid: r.value.sid, to: r.value.to }));

  const failures = results
    .filter((r) => r.status === "rejected")
    .map((r: any) => String(r.reason?.message || r.reason));

  return {
    ok: successes.length,
    failed: failures.length,
    successes,
    failures,
  };
}
