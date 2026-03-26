"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";

type Seller = {
  name: string;
  phone: string;
  active: boolean;
};

export default function AdminSellersPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function load() {
    const r = await adminFetch("/api/admin/sellers/list");
    const j = await r.json();
    if (r.ok && j?.sellers) setSellers(j.sellers);
  }

  useEffect(() => {
    load();
  }, []);

  async function addSeller() {
    if (!name.trim() || !phone.trim()) return;

    await adminFetch("/api/admin/sellers/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
    });

    setName("");
    setPhone("");
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-2xl font-bold">Venditori</div>
        <Link
          href="/admin"
          className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
        >
          ← Torna in admin
        </Link>
      </div>

      <div className="mb-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 text-lg font-bold">Crea venditore</div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-lg border px-3 py-2"
            placeholder="Nome venditore"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded-lg border px-3 py-2"
            placeholder="Telefono"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <button
          className="mt-3 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
          onClick={addSeller}
        >
          Aggiungi venditore
        </button>
      </div>

      <div className="grid gap-3">
        {sellers.map((s, i) => (
          <div key={i} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-lg font-bold">{s.name}</div>
            <div className="text-sm text-gray-700">{s.phone}</div>

            <div className="mt-2 flex items-center justify-between">
              <div className="text-sm">
                Stato: {s.active ? "Attivo" : "Disattivo"}
              </div>

              <div className="flex gap-2">
                <button
                  className="rounded-lg border px-3 py-1 text-sm font-semibold"
                  onClick={async () => {
                    await adminFetch("/api/admin/sellers/toggle", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ phone: s.phone }),
                    });
                    await load();
                  }}
                >
                  {s.active ? "Disattiva" : "Attiva"}
                </button>

                <button
                  className="rounded-lg border px-3 py-1 text-sm font-semibold text-red-600"
                  onClick={async () => {
                    if (!confirm("Eliminare venditore?")) return;
                    await adminFetch("/api/admin/sellers/delete", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ phone: s.phone }),
                    });
                    await load();
                  }}
                >
                  Elimina
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
