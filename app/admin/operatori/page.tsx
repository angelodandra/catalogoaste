"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";

type Operator = {
  id: string;
  username: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string | null;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "Mai";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch { return iso; }
}

export default function AdminOperatoriPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");

  // Form nuovo operatore
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  // Cambio password
  const [changePwdId, setChangePwdId] = useState<string | null>(null);
  const [changePwdVal, setChangePwdVal] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  async function loadOperators() {
    setLoading(true);
    setMsg("");
    try {
      const res = await adminFetch("/api/admin/operatori/list");
      const json = await res.json();
      if (!res.ok) { setMsg(json.error || "Errore"); setMsgType("err"); return; }
      setOperators(json.operators || []);
    } catch (e: any) {
      setMsg(e?.message ?? "Errore rete"); setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  async function createOperator(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMsg("");
    try {
      const res = await adminFetch("/api/admin/operatori/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || "Errore creazione");
        setMsgType("err");
        return;
      }
      setMsg(`✅ Operatore "${json.operator.username}" creato.`);
      setMsgType("ok");
      setNewUsername("");
      setNewPassword("");
      await loadOperators();
    } catch (e: any) {
      setMsg(e?.message ?? "Errore"); setMsgType("err");
    } finally {
      setCreating(false);
    }
  }

  async function deleteOperator(op: Operator) {
    if (!confirm(`Eliminare l'operatore "${op.username}"? Non potrà più accedere.`)) return;
    setLoading(true);
    setMsg("");
    try {
      const res = await adminFetch("/api/admin/operatori/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: op.id, email: op.email }),
      });
      const json = await res.json();
      if (!res.ok) { setMsg(json.error || "Errore eliminazione"); setMsgType("err"); return; }
      setMsg(`✅ Operatore "${op.username}" eliminato.`);
      setMsgType("ok");
      await loadOperators();
    } catch (e: any) {
      setMsg(e?.message ?? "Errore"); setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  async function changePassword(op: Operator) {
    if (changePwdVal.length < 6) {
      setMsg("La password deve avere almeno 6 caratteri."); setMsgType("err"); return;
    }
    setChangingPwd(true);
    setMsg("");
    try {
      // Elimina e ricrea con nuova password (approccio semplice e sicuro)
      const delRes = await adminFetch("/api/admin/operatori/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: op.id, email: op.email }),
      });
      if (!delRes.ok) { const j = await delRes.json(); setMsg(j.error || "Errore"); setMsgType("err"); return; }

      const createRes = await adminFetch("/api/admin/operatori/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: op.username, password: changePwdVal }),
      });
      const j2 = await createRes.json();
      if (!createRes.ok) { setMsg(j2.error || "Errore"); setMsgType("err"); return; }

      setMsg(`✅ Password di "${op.username}" aggiornata.`);
      setMsgType("ok");
      setChangePwdId(null);
      setChangePwdVal("");
      await loadOperators();
    } catch (e: any) {
      setMsg(e?.message ?? "Errore"); setMsgType("err");
    } finally {
      setChangingPwd(false);
    }
  }

  useEffect(() => { loadOperators(); }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Operatori</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestisci gli accessi al pannello stampa ordini.
          Gli operatori accedono tramite <strong>nome utente + password</strong>.
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg border px-4 py-2 text-sm ${
          msgType === "ok"
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {msg}
        </div>
      )}

      {/* ─── Crea nuovo operatore ─────────────────────────────── */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold mb-4">Aggiungi operatore</h2>
        <form onSubmit={createOperator} className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Nome utente</label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="mario"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <p className="text-xs text-gray-400 mt-1">Solo lettere, numeri, - e _</p>
            </div>

            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
              <div className="relative">
                <input
                  className="w-full rounded-lg border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 6 caratteri"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <button
            className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            disabled={creating}
          >
            {creating ? "Creazione in corso…" : "+ Crea operatore"}
          </button>
        </form>
      </div>

      {/* ─── Lista operatori ──────────────────────────────────── */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-base font-semibold">
            Operatori attivi
            {operators.length > 0 && (
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">
                {operators.length}
              </span>
            )}
          </h2>
          <button
            onClick={loadOperators}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            ↻ Aggiorna
          </button>
        </div>

        {loading && (
          <div className="px-5 py-4 text-sm text-gray-400">Caricamento…</div>
        )}

        {!loading && operators.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            Nessun operatore. Aggiungine uno sopra.
          </div>
        )}

        <ul className="divide-y">
          {operators.map((op) => (
            <li key={op.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold uppercase text-indigo-600">
                      {op.username[0]}
                    </div>
                    <div>
                      <div className="font-semibold">{op.username}</div>
                      <div className="text-xs text-gray-400">
                        Creato: {fmtDate(op.created_at)} · Ultimo accesso: {fmtDate(op.last_sign_in_at)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {changePwdId === op.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="rounded-lg border px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-black"
                        type="text"
                        placeholder="Nuova password"
                        value={changePwdVal}
                        onChange={(e) => setChangePwdVal(e.target.value)}
                      />
                      <button
                        onClick={() => changePassword(op)}
                        disabled={changingPwd}
                        className="rounded-lg bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        {changingPwd ? "…" : "Salva"}
                      </button>
                      <button
                        onClick={() => { setChangePwdId(null); setChangePwdVal(""); }}
                        className="rounded-lg border px-2 py-1 text-xs font-semibold hover:bg-gray-50"
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setChangePwdId(op.id); setChangePwdVal(""); }}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 transition-colors"
                    >
                      Cambia password
                    </button>
                  )}

                  <button
                    onClick={() => deleteOperator(op)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Elimina
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Info accesso */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Come accedono gli operatori:</strong> vai su{" "}
        <code className="rounded bg-blue-100 px-1">/operatore/login</code>, inseriscono
        il nome utente (es. <em>mario</em>) e la password che hai impostato. Non serve nessuna email.
      </div>
    </div>
  );
}
