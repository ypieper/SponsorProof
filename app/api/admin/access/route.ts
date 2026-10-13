import { NextResponse } from "next/server";
import { isCurrentUserPlatformAdmin, isPlatformAdminConfigured } from "@/lib/supabase/admin";

export async function GET() {
  if (!isPlatformAdminConfigured()) {
    return NextResponse.json({ isAdmin: false, configured: false });
  }
  return NextResponse.json({ isAdmin: await isCurrentUserPlatformAdmin(), configured: true });
}
