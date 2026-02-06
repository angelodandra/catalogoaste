import Twilio from "twilio";

type SendOpts = {
  toPhones: string[];
  body?: string;
  mediaUrl?: string | null;
  contentSid?: string;
  contentVariables?: Record<string, string>;
};

function toWhatsApp(n: string) {
  if (!n) return "";
  const clean = n.replace(/^whatsapp:/g, "");
  if (clean.startsWith("+")) return `whatsapp:${clean}`;
  return `whatsapp:+${clean}`;
}

export async function sendWhatsAppOrder(opts: SendOpts) {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  const from = process.env.TWILIO_WHATSAPP_FROM || "";
  const messagingServiceSid = (process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();

  if (!sid || !token || (!from && !messagingServiceSid)) {
    throw new Error("Twilio non configurato correttamente");
  }

  const client = Twilio(sid, token);

  const mu = (opts.mediaUrl || "").trim();
  const isLocalUrl =
    !mu || mu.includes("localhost") || mu.includes("127.0.0.1") || mu.includes(".local");

  const bodyText =
    (opts.body || "") +
    (mu && isLocalUrl ? "\n\nPDF: (non disponibile)" : "");

  const results = await Promise.allSettled(
    opts.toPhones
      .filter(Boolean)
      .map((p) => {
        const base: any = {
          to: toWhatsApp(p),
          ...(messagingServiceSid
            ? { messagingServiceSid }
            : { from: toWhatsApp(from) }),
        };

        if (opts.contentSid) {
          return client.messages.create({
            ...base,
            contentSid: opts.contentSid,
            ...(opts.contentVariables
              ? { contentVariables: JSON.stringify(opts.contentVariables) }
              : {}),
          });
        }

        return client.messages.create({
          ...base,
          body: bodyText,
          ...(opts.mediaUrl && !isLocalUrl ? { mediaUrl: [opts.mediaUrl] } : {}),
        });
      })
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
