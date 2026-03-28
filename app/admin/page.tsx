"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

type Stats = {
  totalCatalogs: number;
  activeCatalogs: number;
  totalOrders: number;
  pendingOrders: number;
  nextProgressive: number;
};

// ─── Card statistiche ────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  color = "bg-white",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${color}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-gray-900">{value}</div>
      {sub && <div className="mt-1 text-sm text-gray-500">{sub}</div>}
    </div>
  );
}

// ─── Toast semplice ──────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  function show(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const Toast = toast ? (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
        toast.type === "ok" ? "bg-black text-white" : "bg-red-600 text-white"
      }`}
    >
      {toast.type === "ok" ? "✅" : "⚠️"} {toast.msg}
    </div>
  ) : null;

  return { show, Toast };
}

// ─── Modale conferma ─────────────────────────────────────────────────────────
function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-sm text-gray-700">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pagina principale ───────────────────────────────────────────────────────
export default function AdminPage() {
  const [title, setTitle] = useState("");
  const [onlineTitle, setOnlineTitle] = useState("");
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const { show, Toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState<Catalog | null>(null);
  const [confirmDeleteSold, setConfirmDeleteSold] = useState<Catalog | null>(null);

  // Upload singolo / bulk per catalogo espanso
  const [expandedUpload, setExpandedUpload] = useState<string | null>(null);

  async function loadCatalogs() {
    const { data, error } = await supabaseBrowser()
      .from("catalogs")
      .select("id,title,online_title,is_active,is_visible,owner_phone,created_at")
      .order("created_at", { ascending: false });

    if (!error) setCatalogs((data as any) || []);
  }

  async function loadStats() {
    const [catRes, ordRes, progRes] = await Promise.all([
      supabaseBrowser().from("catalogs").select("id,is_active", { count: "exact" }),
      supabaseBrowser().from("orders").select("id,status", { count: "exact" }),
      supabaseBrowser()
        .from("products")
        .select("progressive_number")
        .order("progressive_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const totalCatalogs = catRes.count ?? catRes.data?.length ?? 0;
    const activeCatalogs = (catRes.data || []).filter((c: any) => c.is_active).length;
    const totalOrders = ordRes.count ?? ordRes.data?.length ?? 0;
    const pendingOrders = (ordRes.data || []).filter((o: any) => o.status !== "cancelled").length;
    const nextProgressive = ((progRes.data as any)?.progressive_number || 0) + 1;

    setStats({ totalCatalogs, activeCatalogs, totalOrders, pendingOrders, nextProgressive });
  }

  useEffect(() => {
    loadCatalogs();
    loadStats();
  }, []);

  async function createCatalog() {
    const t = title.trim();
    if (!t) return show("Inserisci un titolo.", "err");

    setCreateLoading(true);
    try {
      const res = await adminFetch("/api/admin/create-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, online_title: onlineTitle.trim() || null }),
      });

      const json = await res.json();
      if (!res.ok) return show(json.error || "Errore creazione catalogo", "err");

      setTitle("");
      setOnlineTitle("");
      show("Catalogo creato con successo");
      await loadCatalogs();
      await loadStats();
    } finally {
      setCreateLoading(false);
    }
  }

  async function doDeleteSoldProducts(c: Catalog) {
    setConfirmDeleteSold(null);
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/delete-sold-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId: c.id }),
      });
      const json = await res.json();
      if (!res.ok) return show(json.error || "Errore eliminazione venduti", "err");
      const n = json.hidden ?? 0;
      if (n === 0) {
        show("Nessun prodotto venduto visibile da nascondere");
      } else {
        show(`${n} prodott${n === 1 ? "o venduto nascosto" : "i venduti nascosti"} dal catalogo clienti`);
      }
      await loadStats();
    } finally {
      setLoading(false);
    }
  }

  async function doDeleteCatalog(c: Catalog) {
    setConfirmDelete(null);
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/delete-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId: c.id }),
      });

      const json = await res.json();
      if (!res.ok) return show(json.error || "Errore eliminazione", "err");

      show("Catalogo eliminato");
      await loadCatalogs();
      await loadStats();
    } finally {
      setLoading(false);
    }
  }

  async function addProductSingle(e: React.FormEvent<HTMLFormElement>, catalogId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/add-product", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) return show(json.error || "Errore upload singolo", "err");
      show("Foto aggiunta (in bozza)");
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
    if (!files.length) return show("Seleziona almeno una foto.", "err");

    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/add-products-bulk", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) return show(json.error || "Errore upload multiplo", "err");
      show(`Caricate ${json.insertedCount} foto (in bozza)`);
      form.reset();
      await loadStats();
    } finally {
      setLoading(false);
    }
  }

  async function toggleVisible(c: Catalog) {
    await adminFetch("/api/admin/catalog/toggle-visible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, value: !c.is_visible }),
    });
    await loadCatalogs();
  }

  async function openPdf(catalogId: string) {
    const res = await adminFetch(`/api/admin/catalog/pdf?catalogId=${catalogId}`);
    if (!res.ok) return show("Errore generazione PDF", "err");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <>
      {Toast}
      {confirmDelete && (
        <ConfirmModal
          message={`Eliminare definitivamente il catalogo "${confirmDelete.title}"? Verranno cancellati tutti i prodotti e le foto.`}
          onConfirm={() => doDeleteCatalog(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {confirmDeleteSold && (
        <ConfirmModal
          message={`Nascondere i prodotti VENDUTI del catalogo "${confirmDeleteSold.title}" dalla vista clienti? I dati e le foto rimangono intatti. Se rimetti in vendita un prodotto, riappare automaticamente.`}
          onConfirm={() => doDeleteSoldProducts(confirmDeleteSold)}
          onCancel={() => setConfirmDeleteSold(null)}
        />
      )}

      {/* Header pagina */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Panoramica, cataloghi e upload foto
        </p>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Cataloghi totali" value={stats.totalCatalogs} />
          <StatCard label="Cataloghi attivi" value={stats.activeCatalogs} />
          <StatCard label="Ordini totali" value={stats.totalOrders} />
          <StatCard
            label="Prossimo progressivo"
            value={stats.nextProgressive}
            sub="prossima foto caricata"
          />
        </div>
      )}

      {/* Accesso rapido */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/admin/orders"
          className="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-gray-900">Ordini</div>
            <div className="text-xs text-gray-500">Gestisci e annulla ordini</div>
          </div>
        </Link>

        <Link
          href="/admin/customers"
          className="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-gray-900">Clienti</div>
            <div className="text-xs text-gray-500">Approva / revoca accessi</div>
          </div>
        </Link>

        <Link
          href="/admin/stats"
          className="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-gray-900">Statistiche</div>
            <div className="text-xs text-gray-500">Login e attività clienti</div>
          </div>
        </Link>
      </div>

      {/* Crea catalogo */}
      <div className="mb-8 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-gray-900">Crea nuovo catalogo</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titolo interno (es. CIVITAVECCHIA 24-03-26)"
            className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
          />
          <input
            value={onlineTitle}
            onChange={(e) => setOnlineTitle(e.target.value)}
            placeholder="Nome online (es. Civitavecchia)"
            className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
          />
          <button
            onClick={createCatalog}
            disabled={createLoading}
            className="rounded-lg bg-black px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-gray-800"
          >
            {createLoading ? "Creazione…" : "Crea catalogo"}
          </button>
        </div>
      </div>

      {/* Lista cataloghi */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-gray-900">Cataloghi ({catalogs.length})</h2>
        <button
          onClick={() => { loadCatalogs(); loadStats(); }}
          disabled={loading}
          className="rounded-lg border px-3 py-1.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          Aggiorna
        </button>
      </div>

      <div className="space-y-4">
        {catalogs.map((c) => (
          <div key={c.id} className="rounded-xl border bg-white shadow-sm">
            {/* Header card catalogo */}
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 truncate">{c.title}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      c.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {c.is_active ? "Aperto" : "Chiuso"}
                  </span>
                  {c.is_visible && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      Visibile
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  Creato il {new Date(c.created_at).toLocaleString("it-IT")}
                  {c.online_title && ` · Online: ${c.online_title}`}
                </div>
              </div>

              {/* Azioni principali */}
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/catalog/${c.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                >
                  Apri
                </a>

                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${window.location.origin}/catalog/${c.id}`);
                    show("Link copiato");
                  }}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                >
                  Copia link
                </button>

                <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={!!c.is_visible}
                    onChange={() => toggleVisible(c)}
                    className="h-3.5 w-3.5"
                  />
                  Visibile
                </label>

                <Link
                  href={`/admin/catalog/${c.id}/pricing`}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Prezzi
                </Link>

                <button
                  onClick={() => openPdf(c.id)}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                >
                  PDF
                </button>

                <button
                  onClick={() => setConfirmDeleteSold(c)}
                  disabled={loading}
                  className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                >
                  Elimina venduti
                </button>

                <button
                  onClick={() => setExpandedUpload(expandedUpload === c.id ? null : c.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50 ${
                    expandedUpload === c.id ? "bg-gray-100" : ""
                  }`}
                >
                  Upload foto {expandedUpload === c.id ? "▲" : "▼"}
                </button>

                <button
                  onClick={() => setConfirmDelete(c)}
                  disabled={loading}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Elimina
                </button>
              </div>
            </div>

            {/* Upload (collassabile) */}
            {expandedUpload === c.id && (
              <div className="border-t bg-gray-50 px-5 pb-5 pt-4">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Upload singolo */}
                  <div>
                    <div className="mb-2 text-sm font-semibold text-gray-700">Upload singolo (bozza)</div>
                    <form
                      onSubmit={(e) => addProductSingle(e, c.id)}
                      className="flex flex-col gap-2"
                    >
                      <input type="hidden" name="catalogId" value={c.id} />
                      <input
                        name="boxNumber"
                        placeholder="Numero cassa (es. 12)"
                        required
                        className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                      />
                      <input
                        type="file"
                        name="file"
                        accept="image/*"
                        required
                        className="rounded-lg border bg-white px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-gray-800"
                      >
                        Aggiungi foto
                      </button>
                    </form>
                  </div>

                  {/* Upload multiplo */}
                  <div>
                    <div className="mb-2 text-sm font-semibold text-gray-700">
                      Upload multiplo (bozza)
                      {stats && (
                        <span className="ml-2 font-normal text-blue-600">
                          · prossimo prog.: {stats.nextProgressive}
                        </span>
                      )}
                    </div>
                    <form onSubmit={addProductsBulk} className="flex flex-col gap-2">
                      <input type="hidden" name="catalogId" value={c.id} />
                      <div className="flex gap-2">
                        <input
                          name="boxStart"
                          placeholder="Cassa iniziale"
                          required
                          inputMode="numeric"
                          className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                        />
                        <input
                          name="boxStep"
                          defaultValue="1"
                          inputMode="numeric"
                          className="w-24 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                        />
                      </div>
                      <input
                        type="file"
                        name="files"
                        accept="image/*"
                        multiple
                        required
                        className="rounded-lg border bg-white px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-gray-800"
                      >
                        Carica tutte
                      </button>
                      <div className="text-xs text-gray-500">
                        Foto ordinate per nome file. Casse: start, start+step, start+2×step…
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {catalogs.length === 0 && (
          <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            Nessun catalogo ancora. Creane uno sopra.
          </div>
        )}
      </div>
    </>
  );
}
