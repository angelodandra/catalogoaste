"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { adminFetch } from "@/lib/adminFetch";

type Catalog = {
  id: string;
  title: string;
  online_title: string | null;
  is_active: boolean;
  is_visible: boolean;
  owner_phone: string | null;
  created_at: string;
};

export default function AdminPage() {
  const [title, setTitle] = useState("");
  const [onlineTitle, setOnlineTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextProgressive, setNextProgressive] = useState<number | null>(null);

  async function load() {
    const { data, error } = await supabaseBrowser()
      .from("catalogs")
      .select("id,title,online_title,is_active,is_visible,owner_phone,created_at")
      .order("created_at", { ascending: false });

    if (!error) setCatalogs((data as any) || []);
  }

  async function loadNextProgressive() {
    const { data, error } = await supabaseBrowser()
      .from("products")
      .select("progressive_number")
      .order("progressive_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error) {
      setNextProgressive(((data as any)?.progressive_number || 0) + 1);
    }
  }

  useEffect(() => {
    load();
    loadNextProgressive();
  }, []);

  async function createCatalog() {
    setMsg("");
    const t = title.trim();
    if (!t) return setMsg("Inserisci un titolo.");

    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/create-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, online_title: onlineTitle.trim() || null }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || "Errore creazione catalogo");
        return;
      }

      setTitle("");
      setOnlineTitle("");
      setMsg("Catalogo creato ✅");
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function addProductSingle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/add-product", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Errore upload singolo");
        return;
      }
      alert("Foto aggiunta ✅ (in bozza)");
      form.reset();
    } finally {
      setLoading(false);
    }
  }

  async function addProductsBulk(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const files = fd.getAll("files").filter(Boolean);
    if (!files.length) {
      alert("Seleziona almeno una foto.");
      return;
    }

    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/add-products-bulk", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Errore upload multiplo");
        return;
      }
      alert(`Caricate ${json.insertedCount} foto ✅ (in bozza)`);
      form.reset();
      await loadNextProgressive();
    } finally {
      setLoading(false);
    }
  }

  async function deleteCatalog(c: Catalog) {
    const ok = confirm(
      `Eliminare DEFINITIVAMENTE il catalogo "${c.title}"?\n\nVerranno cancellati anche tutti i prodotti e le foto.`
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/delete-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId: c.id }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Errore eliminazione");
        return;
      }

      alert("Catalogo eliminato ✅");
      await load();
    } finally {
      setLoading(false);
    }
  }

  const [loadingCatalog, setLoadingCatalog] = useState(false);

  return (
    <div className="mx-auto max-w-5xl p-4 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
      {/* HEADER + LOGO */}
      <div className="mb-6 flex flex-col items-center gap-2 text-center cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
        <img src="/logo.jpg" alt="Logo azienda" className="h-20 w-auto cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed" />
        <div className="text-2xl font-bold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Pannello Admin</div>
        <div className="text-sm text-gray-600 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Carica foto, assegna casse, inserisci prezzi, pubblica e gestisci ordini</div>

        {/* NAV PRINCIPALE */}
        <div className="mt-2 flex flex-wrap justify-center gap-2 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
          <a
            href="/admin/orders"
            className="rounded-lg bg-black px-4 py-2 font-semibold text-white cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
          >
            Gestisci ordini
          </a>

            <a
              href="/admin/customers"
              className="block rounded-2xl border bg-white p-4 shadow-sm hover:bg-gray-50 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
            >
              <div className="text-lg font-bold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Clienti</div>
              <div className="text-sm text-gray-600 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Gestisci autorizzazioni (revoca/riattiva)</div>
            </a>

          <a
            href="/admin/sellers"
            className="block rounded-2xl border bg-white p-4 shadow-sm hover:bg-gray-50 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
          >
            <div className="text-lg font-bold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Venditori</div>
            <div className="text-sm text-gray-600 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Gestisci venditori (aggiungi/disattiva/elimina)</div>
          </a>

          <a
            href="/admin/stats"
            className="block rounded-2xl border bg-white p-4 shadow-sm hover:bg-gray-50 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
          >
            <div className="text-lg font-bold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Statistiche</div>
            <div className="text-sm text-gray-600 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Login e ordini (ultimi giorni)</div>
          </a>

          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
          >
            Aggiorna cataloghi
          </button>
        </div>
      </div>

      {/* CREA CATALOGO */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
        <div className="text-sm font-semibold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Crea nuovo catalogo</div>

        <div className="mt-2 flex flex-col gap-2 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titolo catalogo interno (es. CIVITAVECCHIA 24-03-26)"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/30 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
          />
          <input
            value={onlineTitle}
            onChange={(e) => setOnlineTitle(e.target.value)}
            placeholder="Nome catalogo online (es. Civitavecchia)"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/30 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
          />
          <button
            onClick={createCatalog}
            disabled={loading}
            className="rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
          >
            Crea
          </button>
        </div>

        {msg && <div className="mt-2 text-sm cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">{msg}</div>}
      </div>

      <h2 className="mt-6 text-lg font-bold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Cataloghi</h2>

      <div className="mt-3 grid gap-3 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
        {catalogs.map((c) => (
          <div key={c.id} className="rounded-2xl border bg-white p-4 shadow-sm cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
              <div>
                <div className="text-base font-bold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">{c.title}</div>
                <div className="mt-1 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
                  {new Date(c.created_at).toLocaleString("it-IT")} — Stato:{" "}
                  <span className="font-semibold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">{c.is_active ? "APERTO" : "CHIUSO"}</span>
                </div>
              </div>

              {/* BOTTONI AZIONI */}
              <div className="flex flex-wrap gap-2 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
                <a
                  href={`/catalog/${c.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                >
                  Apri catalogo cliente
                </a>

                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${window.location.origin}/catalog/${c.id}`);
                    alert("Link copiato ✅");
                  }}
                  className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                >
                  Copia link
                </button>

                <label className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
                  <input
                    type="checkbox"
                    checked={!!c.is_visible}
                    onChange={async () => {
                      await adminFetch("/api/admin/catalog/toggle-visible", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: c.id, value: !c.is_visible }),
                      });
                      await load();
                    }}
                  />
                  Visibile
                </label>

                <a
                  href={`/admin/catalog/${c.id}/pricing`}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                >
                  Prezzi
                </a>
                <a
                  className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                  onClick={() => {
                    (async () => {
                      setLoadingCatalog(true);
                      const res = await adminFetch(`/api/admin/catalog/pdf?catalogId=${c.id}`);
                      if (!res.ok) { alert("Errore PDF catalogo"); return; }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank");
                      setTimeout(() => URL.revokeObjectURL(url), 60000);
                      setLoadingCatalog(false);
                    })();
                  }}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF catalogo
                </a>

                <button
                  onClick={() => deleteCatalog(c)}
                  disabled={loading}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-60 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                >
                  Elimina
                </button>
              </div>
            </div>

            {/* UPLOAD SINGOLO */}
            <div className="mt-4 rounded-xl border bg-gray-50 p-3 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
              <div className="text-sm font-semibold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Upload singolo (bozza)</div>
              <form onSubmit={addProductSingle} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
                <input type="hidden" name="catalogId" value={c.id} />

                <input
                  name="boxNumber"
                  placeholder="Numero cassa (es. 12)"
                  required
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/30 sm:w-56 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                />

                <input
                  type="file"
                  name="file"
                  accept="image/*"
                  required
                  className="w-full rounded-lg border bg-white px-3 py-2 sm:flex-1 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                >
                  Aggiungi foto
                </button>
              </form>
            </div>

            {/* UPLOAD MULTIPLO */}
            <div className="mt-3 rounded-xl border bg-gray-50 p-3 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
              <div className="text-sm font-semibold cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">Upload multiplo (bozza)</div>
              <div className="mt-1 text-xs text-blue-700">
                Primo progressivo libero: {nextProgressive ?? "…"}
              </div>
              <form onSubmit={addProductsBulk} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
                <input type="hidden" name="catalogId" value={c.id} />

                <input
                  name="boxStart"
                  placeholder="Cassa iniziale (es. 1)"
                  required
                  inputMode="numeric"
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/30 sm:w-56 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                />

                <input
                  name="boxStep"
                  defaultValue="1"
                  inputMode="numeric"
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/30 sm:w-40 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                />

                <input
                  type="file"
                  name="files"
                  accept="image/*"
                  multiple
                  required
                  className="w-full rounded-lg border bg-white px-3 py-2 sm:flex-1 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed"
                >
                  Carica tutte
                </button>
              </form>

              <div className="mt-2 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed">
                Le foto vengono ordinate per nome file. Le casse: start, start+step, start+2*step…
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}