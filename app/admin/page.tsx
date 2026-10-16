import { notFound, redirect } from "next/navigation";
import { getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminIndexPage() {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus === 401) redirect("/admin/login");
  if (auth.responseStatus === 403) notFound();
  if (auth.responseStatus === 503) return <main className="content"><section className="panel admin-notice"><strong>Admin-Verwaltung nicht verfügbar</strong><p>Die serverseitige Admin-Konfiguration konnte nicht geprüft werden.</p></section></main>;
  redirect("/admin/users");
}
