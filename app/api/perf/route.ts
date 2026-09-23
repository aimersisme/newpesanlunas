import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = performance.now();
  try {
    const supabase = await createClient();

    const authStarted = performance.now();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    const authMs = Math.round(performance.now() - authStarted);

    let dbMs: number | null = null;
    let dbError: string | null = null;
    if (auth.user) {
      const dbStarted = performance.now();
      const result = await supabase
        .from("business_members")
        .select("business_id")
        .eq("status", "active")
        .limit(1);
      dbMs = Math.round(performance.now() - dbStarted);
      dbError = result.error?.message ?? null;
    }

    return NextResponse.json({
      ok: !authError && !dbError,
      version: "0.2.9",
      vercelRegion: process.env.VERCEL_REGION ?? null,
      authMs,
      dbMs,
      totalMs: Math.round(performance.now() - started),
      authenticated: Boolean(auth.user),
      authError: authError?.message ?? null,
      dbError,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      version: "0.2.9",
      vercelRegion: process.env.VERCEL_REGION ?? null,
      totalMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
