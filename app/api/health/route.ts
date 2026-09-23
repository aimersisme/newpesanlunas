import { NextResponse } from "next/server";
import {
  getMissingSupabaseEnvNames,
  readSupabasePublicConfig,
} from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = readSupabasePublicConfig();
  const missing = getMissingSupabaseEnvNames();

  return NextResponse.json(
    {
      app: "PesanLunas",
      version: "0.2.9",
      runtime: "ok",
      supabaseConfigured: Boolean(config),
      missingEnvironmentVariables: missing,
      keyMode: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        ? "publishable"
        : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          ? "anon"
          : "none",
    },
    { status: config ? 200 : 503 },
  );
}
