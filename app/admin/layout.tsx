"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import AdminLogoutButton from "@/components/AdminLogoutButton";

function parseList(s: string | undefined | null) {
  return (s || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = supabaseBrowser;

  const allow = useMemo(() => parseList(process.env.NEXT_PUBLIC_ADMIN_EMAILS), []);

  useEffect(() => {
    if (pathname?.startsWith("/admin/login")) return;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.replace("/admin/login");
        return;
      }

      const email = (session.user?.email || "").toLowerCase();
      if (allow.length > 0 && !allow.includes(email)) {
        await supabase.auth.signOut();
        alert("Email non autorizzata per Admin");
        router.replace("/admin/login");
        return;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Niente barra nella pagina di login
  if (pathname?.startsWith("/admin/login")) return <>{children}</>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-end">
        <AdminLogoutButton />
      </div>
      {children}
    </div>
  );
}
