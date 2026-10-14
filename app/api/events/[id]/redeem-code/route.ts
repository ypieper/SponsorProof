import { NextResponse } from "next/server";
import { hashActivationCode } from "@/lib/activation-codes";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

const messages: Record<string, string> = {
  INVALID_ACTIVATION_CODE: "Der Freischaltcode ist ungültig.",
  ACTIVATION_CODE_DISABLED: "Dieser Freischaltcode wurde deaktiviert.",
  ACTIVATION_CODE_EXPIRED: "Dieser Freischaltcode ist abgelaufen.",
  ACTIVATION_CODE_EXHAUSTED: "Dieser Freischaltcode wurde bereits vollständig genutzt.",
  ACTIVATION_CODE_ORGANIZATION_MISMATCH: "Dieser Freischaltcode ist für einen anderen Veranstalterbereich bestimmt.",
  ACTIVATION_CODE_EVENT_MISMATCH: "Dieser Freischaltcode ist einem anderen Event zugeordnet.",
  ACTIVATION_CODE_CANNOT_DOWNGRADE: "Der Freischaltcode würde den aktuellen Tarif herabstufen.",
  EVENT_ACCESS_DENIED: "Du hast keinen Zugriff auf dieses Event.",
};

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code || code.length > 80 || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Bitte gib einen gültigen Freischaltcode ein." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });

  const { data, error } = await supabase.rpc("redeem_event_activation_code", {
    target_event_id: id,
    target_code_hash: hashActivationCode(code),
  });
  if (error) {
    const reason = Object.keys(messages).find((key) => error.message.includes(key));
    return NextResponse.json({ error: reason ? messages[reason] : "Der Freischaltcode konnte nicht eingelöst werden." }, { status: reason === "EVENT_ACCESS_DENIED" ? 403 : 400 });
  }
  return NextResponse.json({ plan: data }, { headers: { "Cache-Control": "no-store" } });
}
