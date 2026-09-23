import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

type SendPayload = {
  businessId?: string;
  destination?: string;
  message?: string;
  fileUrl?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  invoiceId?: string | null;
  eventKey?: string | null;
};

function normalizeDestination(value: string) {
  const digits = value.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: SendPayload;
  try { body = await request.json() as SendPayload; }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const businessId = body.businessId?.trim() || "";
  const destination = normalizeDestination(body.destination || "");
  const message = body.message?.trim() || "";
  if (!businessId || !destination || !message) {
    return NextResponse.json({ error: "businessId, destination, and message are required" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("business_members")
    .select("role,status")
    .eq("business_id", businessId)
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: setting } = await supabase
    .from("business_settings")
    .select("value")
    .eq("business_id", businessId)
    .eq("key", "whatsapp_provider")
    .maybeSingle();
  const provider = String((setting?.value as Record<string, unknown> | null)?.provider ?? "manual");

  if (provider === "manual") {
    const manualUrl = `https://wa.me/${destination}?text=${encodeURIComponent(message)}`;
    return NextResponse.json({ ok: true, provider: "manual", manualUrl });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diatur di Vercel Environment Variables." }, { status: 503 });
  }
  const admin = createSupabaseClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: integration, error: integrationError } = await admin
    .from("whatsapp_integrations")
    .select("provider,api_token")
    .eq("business_id", businessId)
    .maybeSingle();
  if (integrationError) return NextResponse.json({ error: integrationError.message }, { status: 500 });
  const configuredToken = String(integration?.api_token ?? "").trim();
  if (integration?.provider && String(integration.provider) !== provider) {
    return NextResponse.json({ error: "Provider WhatsApp belum sinkron. Buka Integrasi WhatsApp lalu Simpan Pengaturan." }, { status: 409 });
  }

  let ok = false;
  let externalId: string | null = null;
  let errorMessage: string | null = null;
  let providerResponse: unknown = null;

  try {
    if (provider === "fonnte") {
      const token = configuredToken;
      if (!token) throw new Error("Token Fonnte belum diisi di menu Integrasi WhatsApp.");
      const form = new FormData();
      form.set("target", destination);
      form.set("message", message);
      form.set("countryCode", "62");
      if (body.fileUrl) form.set("url", body.fileUrl);
      const response = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token },
        body: form,
        cache: "no-store",
      });
      providerResponse = await response.json().catch(() => ({}));
      const parsed = providerResponse as Record<string, unknown>;
      ok = response.ok && parsed.status !== false;
      externalId = String(parsed.id ?? parsed.detail ?? "") || null;
      if (!ok) errorMessage = String(parsed.reason ?? parsed.message ?? `Fonnte HTTP ${response.status}`);
    } else if (provider === "starsender") {
      const token = configuredToken;
      if (!token) throw new Error("API Key Starsender belum diisi di menu Integrasi WhatsApp.");
      const response = await fetch("https://api.starsender.online/api/send", {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({
          messageType: body.fileUrl ? "media" : "text",
          to: destination,
          body: message,
          ...(body.fileUrl ? { file: body.fileUrl } : {}),
        }),
        cache: "no-store",
      });
      providerResponse = await response.json().catch(() => ({}));
      const parsed = providerResponse as Record<string, unknown>;
      ok = response.ok && parsed.success !== false;
      const data = parsed.data as Record<string, unknown> | undefined;
      externalId = String(data?.id ?? data?.message_id ?? "") || null;
      if (!ok) errorMessage = String(parsed.message ?? `Starsender HTTP ${response.status}`);
    } else {
      throw new Error(`Provider ${provider} tidak dikenali`);
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "WhatsApp gateway error";
  }

  await supabase.from("message_deliveries").insert({
    business_id: businessId,
    customer_id: body.customerId || null,
    order_id: body.orderId || null,
    invoice_id: body.invoiceId || null,
    event_key: body.eventKey || "manual_send",
    provider,
    destination,
    message_body: message,
    status: ok ? "sent" : "failed",
    external_id: externalId,
    error_message: errorMessage,
    sent_at: ok ? new Date().toISOString() : null,
    created_by: authData.user.id,
  });

  if (!ok) return NextResponse.json({ ok: false, provider, error: errorMessage }, { status: 502 });
  return NextResponse.json({ ok: true, provider, externalId, response: providerResponse });
}
