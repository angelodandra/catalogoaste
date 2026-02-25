import { supabaseBrowser } from "@/lib/supabaseBrowser";

export async function getAdminToken(): Promise<string | null> {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getAdminToken();

  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}
