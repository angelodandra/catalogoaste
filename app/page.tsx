import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export default async function HomePage() {
  const cookieStore = await cookies();
  const customerPhone = cookieStore.get("customer_phone")?.value || "";

  if (!customerPhone) redirect("/auth");

  redirect("/catalog");
}
