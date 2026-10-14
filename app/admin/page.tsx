import { notFound, redirect } from "next/navigation";
import AdminDashboard from "@/components/admin-dashboard";
import { getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";
import { privatePageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Administration", "Verwalte sponso-Plattformzugänge und Freischaltcodes.");

export default async function AdminPage() {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus === 401) redirect("/login");
  if (auth.responseStatus === 403) notFound();
  if (auth.responseStatus === 503) return <main className="content"><section className="panel admin-notice"><strong>Admin-Verwaltung nicht verfügbar</strong><p>Die serverseitige Admin-Konfiguration konnte nicht geprüft werden.</p></section></main>;
  return <AdminDashboard />;
}
