import { NextResponse } from "next/server";
import { finishOrganizationDeletion } from "@/lib/admin-organization-deletion";
import { getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";

type Context = { params: Promise<{ jobId: string }> };

export async function POST(_request: Request, context: Context) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf die Veranstalterbereiche." }, { status: auth.responseStatus });
  const { jobId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(jobId)) {
    return NextResponse.json({ error: "Der Löschauftrag ist ungültig." }, { status: 400 });
  }
  const result = await finishOrganizationDeletion(auth.admin!, jobId);
  if ("stage" in result) return NextResponse.json({ error: `Bereinigung angehalten bei „${result.stage}“: ${result.message}` }, { status: 503 });
  return NextResponse.json({ ok: true, softDeletedUserCount: result.softDeletedUserCount });
}
