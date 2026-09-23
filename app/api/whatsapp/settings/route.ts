import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Provider = "manual" | "fonnte" | "starsender";

function validProvider(value: unknown): Provider {
  return value === "fonnte" || value === "starsender" ? value : "manual";
}

function maskToken(token: string | null | undefined) {
  const value = String(token ?? "");
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

async function requireOwner() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { supabase, user: null, businessId: null };

  const { data: membership } = await supabase
    .from("business_members")
    .select("business_id,role,status")
    .eq("user_id", authData.user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();

  return { supabase, user: authData.user, businessId: membership?.business_id ?? null };
}

export async function GET() {
  const { supabase, user, businessId } = await requireOwner();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!businessId) return NextResponse.json({ error: "Hanya Owner yang dapat mengatur integrasi WhatsApp." }, { status: 403 });

  const { data, error } = await supabase
    .from("whatsapp_integrations")
    .select("provider,api_token")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    provider: validProvider(data?.provider),
    configured: Boolean(data?.api_token),
    maskedToken: maskToken(data?.api_token),
  });
}

export async function POST(request: Request) {
  const { supabase, user, businessId } = await requireOwner();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!businessId) return NextResponse.json({ error: "Hanya Owner yang dapat mengatur integrasi WhatsApp." }, { status: 403 });

  let body: { provider?: unknown; token?: unknown; clearToken?: unknown };
  try {
    body = await request.json() as { provider?: unknown; token?: unknown; clearToken?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = validProvider(body.provider);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const clearToken = body.clearToken === true;

  const { data: existing, error: existingError } = await supabase
    .from("whatsapp_integrations")
    .select("api_token")
    .eq("business_id", businessId)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const apiToken = clearToken ? null : (token || existing?.api_token || null);
  if (provider !== "manual" && !apiToken) {
    return NextResponse.json({ error: `Token ${provider === "fonnte" ? "Fonnte" : "Starsender"} wajib diisi.` }, { status: 400 });
  }

  const { error } = await supabase.from("whatsapp_integrations").upsert({
    business_id: businessId,
    provider,
    api_token: apiToken,
    updated_by: user.id,
  }, { onConflict: "business_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, provider, configured: Boolean(apiToken), maskedToken: maskToken(apiToken) });
}
