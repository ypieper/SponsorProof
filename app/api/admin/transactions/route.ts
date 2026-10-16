import { NextResponse } from "next/server";
import { createAdminClient, getAuthorizedPlatformAdmin } from "@/lib/supabase/admin";
import { formatSponsoId } from "@/lib/sponso-id";

export const dynamic = "force-dynamic";
const pageSize = 50;

export async function GET(request: Request) {
  const auth = await getAuthorizedPlatformAdmin();
  if (auth.responseStatus) return NextResponse.json({ error: "Kein Zugriff auf Transaktionen." }, { status: auth.responseStatus });

  const searchParams = new URL(request.url).searchParams;
  const requestedPage = Number(searchParams.get("page") ?? "1");
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 100_000) {
    return NextResponse.json({ error: "Ungültige Transaktionsseite." }, { status: 400 });
  }
  const query = (searchParams.get("q") ?? "").trim().slice(0, 100).replace(/[^\p{L}\p{N}\s@._/-]/gu, "");
  const admin = createAdminClient();
  let transactionsQuery = admin.from("admin_transaction_feed")
    .select("id, transaction_at, organization_name, sponso_id, event_name, product, amount_cents, status, provider, reference, kind")
    .order("transaction_at", { ascending: false })
    .order("id", { ascending: true })
    .range((requestedPage - 1) * pageSize, (requestedPage - 1) * pageSize + pageSize);
  if (query) {
    const pattern = query.replace(/[\\%_]/g, "\\$&");
    transactionsQuery = transactionsQuery.or([
      `organization_name.ilike.%${pattern}%`, `sponso_id.ilike.%${pattern}%`, `event_name.ilike.%${pattern}%`,
      `product.ilike.%${pattern}%`, `status.ilike.%${pattern}%`, `provider.ilike.%${pattern}%`, `reference.ilike.%${pattern}%`,
    ].join(","));
  }
  const [transactionResult, summaryResult] = await Promise.all([
    transactionsQuery,
    requestedPage === 1 && !query ? admin.rpc("admin_transaction_summary") : Promise.resolve(null),
  ]);
  if (transactionResult.error || summaryResult?.error) {
    return NextResponse.json({ error: "Transaktionen konnten nicht geladen werden. Prüfe, ob die aktuelle Transaktionsmigration angewendet wurde." }, { status: 500 });
  }

  const rows = transactionResult.data ?? [];
  const transactions = rows.slice(0, pageSize).map((item) => ({
    id: item.id,
    date: item.transaction_at,
    organizationName: item.organization_name,
    sponsoId: item.sponso_id ? formatSponsoId(item.sponso_id) : null,
    eventName: item.event_name,
    product: item.product,
    amountCents: Number(item.amount_cents),
    status: item.status,
    provider: item.provider,
    reference: item.reference,
    kind: item.kind,
  }));
  const summary = summaryResult?.data?.[0];
  return NextResponse.json({
    transactions,
    page: requestedPage,
    pageSize,
    hasMore: rows.length > pageSize,
    ...(summary ? { summary: {
      paidCount: Number(summary?.paid_count ?? 0),
      confirmedTotalCents: Number(summary?.confirmed_total_cents ?? 0),
      enterpriseCount: Number(summary?.enterprise_count ?? 0),
    } } : {}),
  }, { headers: { "Cache-Control": "no-store" } });
}
