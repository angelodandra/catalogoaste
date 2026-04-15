"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const OP_DOMAIN = "@op.interno";

function parseList(s: string | undefined | null) {
  return (s || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedEmail(email: string): boolean {
  const e = email.toLowerCase();
  // Operatori (username@op.interno) oppure admin
  if (e.endsWith(OP_DOMAIN)) return true;
  const admins = parseList(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  return admins.includes(e);
}

function displayName(email: string): string {
  if (email.endsWith(OP_DOMAIN)) {
    return email.replace(OP_DOMAIN, "");
  }
  return email;
}

function LogoutButton() {
  const router = useRouter();
  const supabase = supabaseBrowser;

  async function handleLogout() {
    await supabase().auth.signOut();
    router.replace("/operatore/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      Logout
    </button>
  );
}

export default function OperatoreLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = supabaseBrowser;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDisplay, setUserDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (pathname?.startsWith("/operatore/login")) return;

    (async () => {
      const { data } = await supabase().auth.getSession();
      const session = data.session;

      if (!session) {
        router.replace("/operatore/login");
        return;
      }

      const email = (session.user?.email || "").toLowerCase();
      if (!isAllowedEmail(email)) {
        await supabase().auth.signOut();
        alert("Accesso non autorizzato.");
        router.replace("/operatore/login");
        return;
      }

      setUserDisplay(displayName(email));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Niente layout nelle pagine di login e stampa
  if (pathname?.startsWith("/operatore/login")) return <>{children}</>;
  if (pathname?.startsWith("/operatore/orders/print")) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-white shadow-lg transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex h-16 items-center gap-3 border-b px-4">
          <img src="/logo.jpg" alt="Logo" className="h-9 w-auto object-contain" />
          <div>
            <div className="text-sm font-bold leading-tight">Pannello Operatore</div>
            <div className="text-xs text-gray-500">Stampa ordini</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <a
            href="/operatore/orders"
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname?.startsWith("/operatore/orders")
                ? "bg-black text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Ordini
          </a>
          <a
            href="/operatore/fulfillment"
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname?.startsWith("/operatore/fulfillment")
                ? "bg-black text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Evasione ordini
          </a>
        </nav>

        {/* Footer: nome utente + logout */}
        <div className="border-t p-4 space-y-2">
          {userDisplay && (
            <div className="flex items-center gap-2 px-1">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold uppercase text-gray-600">
                {userDisplay[0]}
              </div>
              <div className="truncate text-sm font-medium text-gray-700 capitalize">
                {userDisplay}
              </div>
            </div>
          )}
          <LogoutButton />
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar solo mobile */}
        <header className="flex h-16 items-center gap-4 border-b bg-white px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 hover:bg-gray-100"
            aria-label="Apri menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img src="/logo.jpg" alt="Logo" className="h-8 w-auto object-contain" />
          <span className="text-sm font-bold capitalize">{userDisplay || "Operatore"}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
