import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships } = await supabase
    .from("business_members")
    .select("business_id,role,status")
    .eq("user_id", authData.user.id)
    .eq("role", "owner")
    .eq("status", "active");

  if (!memberships?.length) return NextResponse.json({ error: "Hanya Owner yang dapat menjalankan reminder." }, { status: 403 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const cronSecret = process.env.REMINDER_CRON_SECRET?.trim();
  if (!supabaseUrl || !cronSecret) {
    return NextResponse.json({
      error: "REMINDER_CRON_SECRET belum diatur di Vercel Environment Variables.",
      hint: "Isi secret yang sama dengan REMINDER_CRON_SECRET pada Supabase Edge Function.",
    }, { status: 503 });
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/process-reminders`, {
      method: "POST",
      headers: { "x-cron-secret": cronSecret },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: String((payload as Record<string, unknown>)?.error ?? `HTTP ${response.status}`), payload }, { status: response.status });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menjalankan reminder" }, { status: 502 });
  }
}
