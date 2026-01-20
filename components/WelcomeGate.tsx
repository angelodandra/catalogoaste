"use client";

import { useState } from "react";

function formatPhoneLive(input: string) {
  let x = (input || "").trim();
  if (!x) return "";

  x = x.replace(/^whatsapp:/, "");
  x = x.replace(/\s+/g, "");
  x = x.replace(/^00/, "+"); // 0039 -> +39

  // Se parte con +, tieni + e numeri
  if (x.startsWith("+")) {
    return "+" + x.slice(1).replace(/[^\d]/g, "");
  }

  // Solo cifre
  const digits = x.replace(/[^\d]/g, "");

  // Default Italia: se sembra cellulare 10 cifre che inizia con 3
  if (digits.length === 10 && digits.startsWith("3")) return "+39" + digits;

  // Se ha scritto 39 senza +
  if (digits.startsWith("39") && digits.length >= 11) return "+" + digits;

  // Altrimenti lascia come cifre (senza forzare + finché non è chiaro)
  return digits;
}

export default function WelcomeGate(props: {
  onSubmit: (name: string, company: string, phone: string) => void;
  loading?: boolean;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");

  const canSubmit = !!name && !!company && !!phone;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        {/* LOGO */}
        <div className="mb-6 flex justify-center">
          <img src="/logo.jpg" alt="Logo azienda" className="h-20 w-auto" />
        </div>

        <h1 className="mb-2 text-center text-2xl font-bold">
          Benvenuto nel nostro sistema di acquisto
        </h1>

        <p className="mb-6 text-center text-sm text-gray-600">
          Prima registrazione: inserisci i tuoi dati per accedere ai cataloghi.
        </p>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Nome e Cognome"
            className="w-full rounded-lg border px-4 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            type="text"
            placeholder="Ragione sociale"
            className="w-full rounded-lg border px-4 py-2"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />

          <div>
            <input
              type="tel"
              placeholder="Cellulare (es. +39...)"
              className="w-full rounded-lg border px-4 py-2"
              value={phone}
              onChange={(e) => setPhone(formatPhoneLive(e.target.value))}
            />
            <div className="mt-1 text-xs text-gray-500">
              Se non inserisci il prefisso, aggiungiamo automaticamente <b>+39</b>.
            </div>
          </div>

          <button
            className="w-full rounded-lg bg-black px-4 py-2 font-bold text-white disabled:opacity-50"
            disabled={!canSubmit || props.loading}
            onClick={() => props.onSubmit(name, company, phone)}
          >
            Registrati
          </button>
        </div>
      </div>
    </div>
  );
}
