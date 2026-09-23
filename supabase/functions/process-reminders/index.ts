import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type JsonRecord = Record<string, unknown>;
type Provider = "manual" | "fonnte" | "starsender";

type InvoiceRow = {
  id: string;
  business_id: string;
  order_id: string;
  customer_id: string;
  invoice_number: string;
  due_date: string | null;
  balance_due: number;
  payment_status: string;
  customers: { name?: string | null; whatsapp?: string | null } | { name?: string | null; whatsapp?: string | null }[] | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function customerFrom(value: InvoiceRow["customers"]) {
  if (Array.isArray(value)) return value[0] ?? {};
  return value ?? {};
}

function normalizeDestination(value: string) {
  const digits = value.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function localDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function diffDays(today: string, dueDate: string) {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

function eventForDayOffset(offset: number) {
  if (offset === -1) return "reminder_h1";
  if (offset === 0) return "reminder_due";
  if (offset === 1) return "reminder_overdue_1";
  if (offset === 3) return "reminder_overdue_3";
  if (offset === 7) return "reminder_overdue_7";
  return null;
}

function rupiah(value: number) {
  return `Rp${Math.max(0, Math.trunc(value)).toLocaleString("id-ID")}`;
}

function formatMessage(template: string, input: {
  customerName: string;
  invoiceNumber: string;
  balanceDue: number;
  dueDate: string;
  businessName: string;
}) {
  return template
    .replaceAll("{customer_name}", input.customerName)
    .replaceAll("{invoice_number}", input.invoiceNumber)
    .replaceAll("{balance_due}", rupiah(input.balanceDue))
    .replaceAll("{due_date}", input.dueDate)
    .replaceAll("{business_name}", input.businessName);
}

async function sendGateway(provider: Provider, destination: string, message: string) {
  if (provider === "fonnte") {
    const token = Deno.env.get("FONNTE_TOKEN")?.trim();
    if (!token) throw new Error("FONNTE_TOKEN belum diset pada Supabase Edge Function secrets");
    const form = new FormData();
    form.set("target", destination);
    form.set("message", message);
    form.set("countryCode", "62");
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token },
      body: form,
    });
    const payload = await response.json().catch(() => ({})) as JsonRecord;
    const ok = response.ok && payload.status !== false;
    return {
      ok,
      externalId: String(payload.id ?? payload.detail ?? "") || null,
      error: ok ? null : String(payload.reason ?? payload.message ?? `Fonnte HTTP ${response.status}`),
    };
  }

  if (provider === "starsender") {
    const token = Deno.env.get("STARSENDER_API_KEY")?.trim();
    if (!token) throw new Error("STARSENDER_API_KEY belum diset pada Supabase Edge Function secrets");
    const response = await fetch("https://api.starsender.online/api/send", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ messageType: "text", to: destination, body: message }),
    });
    const payload = await response.json().catch(() => ({})) as JsonRecord;
    const data = getRecord(payload.data);
    const ok = response.ok && payload.success !== false;
    return {
      ok,
      externalId: String(data.id ?? data.message_id ?? "") || null,
      error: ok ? null : String(payload.message ?? `Starsender HTTP ${response.status}`),
    };
  }

  throw new Error("Provider manual tidak mendukung auto reminder");
}

Deno.serve(async (request) => {
  if (request.method !== "POST" && request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET")?.trim();
  if (!cronSecret) return json({ error: "REMINDER_CRON_SECRET belum diset" }, 500);
  const supplied = request.headers.get("x-cron-secret")?.trim();
  if (!supplied || supplied !== cronSecret) return json({ error: "Unauthorized scheduler" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json({ error: "Supabase service configuration missing" }, 500);

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: settingRows, error: settingsError } = await supabase
    .from("business_settings")
    .select("business_id,key,value")
    .in("key", ["auto_reminder", "whatsapp_provider"]);
  if (settingsError) return json({ error: settingsError.message }, 500);

  const settingsByBusiness = new Map<string, { auto: boolean; provider: Provider }>();
  for (const row of settingRows ?? []) {
    const current = settingsByBusiness.get(row.business_id) ?? { auto: false, provider: "manual" as Provider };
    const value = getRecord(row.value);
    if (row.key === "auto_reminder") current.auto = Boolean(value.enabled);
    if (row.key === "whatsapp_provider") {
      const p = String(value.provider ?? "manual");
      current.provider = p === "fonnte" || p === "starsender" ? p : "manual";
    }
    settingsByBusiness.set(row.business_id, current);
  }

  const enabledBusinessIds = [...settingsByBusiness.entries()]
    .filter(([, setting]) => setting.auto && setting.provider !== "manual")
    .map(([businessId]) => businessId);

  if (enabledBusinessIds.length === 0) return json({ ok: true, processed: 0, sent: 0, skipped: 0, failed: 0, note: "Tidak ada bisnis dengan auto reminder + gateway aktif." });

  const [{ data: businesses, error: businessError }, { data: invoices, error: invoiceError }, { data: templates, error: templateError }] = await Promise.all([
    supabase.from("businesses").select("id,name,timezone").in("id", enabledBusinessIds).eq("is_active", true).is("deleted_at", null),
    supabase.from("invoices")
      .select("id,business_id,order_id,customer_id,invoice_number,due_date,balance_due,payment_status,customers(name,whatsapp)")
      .in("business_id", enabledBusinessIds)
      .in("payment_status", ["unpaid", "partial"])
      .not("due_date", "is", null)
      .is("deleted_at", null),
    supabase.from("message_templates").select("business_id,event_key,body,is_active").in("business_id", enabledBusinessIds).eq("is_active", true),
  ]);

  if (businessError) return json({ error: businessError.message }, 500);
  if (invoiceError) return json({ error: invoiceError.message }, 500);
  if (templateError) return json({ error: templateError.message }, 500);

  const businessMap = new Map((businesses ?? []).map((b) => [b.id, b]));
  const templateMap = new Map<string, string>();
  for (const row of templates ?? []) {
    templateMap.set(`${row.business_id}:${row.event_key}`, row.body);
  }

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const details: JsonRecord[] = [];

  for (const raw of invoices ?? []) {
    const invoice = raw as unknown as InvoiceRow;
    const business = businessMap.get(invoice.business_id);
    if (!business || !invoice.due_date) { skipped++; continue; }
    const setting = settingsByBusiness.get(invoice.business_id);
    if (!setting || !setting.auto || setting.provider === "manual") { skipped++; continue; }

    const today = localDate(business.timezone || "Asia/Jakarta");
    const offset = diffDays(today, invoice.due_date);
    const eventKey = eventForDayOffset(offset);
    if (!eventKey) { skipped++; continue; }

    const customer = customerFrom(invoice.customers);
    const destination = normalizeDestination(String(customer.whatsapp ?? ""));
    if (!destination) { skipped++; details.push({ invoice: invoice.invoice_number, status: "skip", reason: "WhatsApp pelanggan kosong" }); continue; }

    processed++;
    const idempotencyKey = `auto-reminder:${invoice.id}:${eventKey}:${invoice.due_date}`;
    const template = templateMap.get(`${invoice.business_id}:${eventKey}`)
      ?? templateMap.get(`${invoice.business_id}:payment_reminder`)
      ?? "Halo {customer_name}, kami mengingatkan sisa tagihan {invoice_number} sebesar {balance_due}, jatuh tempo {due_date}. Terima kasih. - {business_name}";
    const message = formatMessage(template, {
      customerName: String(customer.name ?? "Pelanggan"),
      invoiceNumber: invoice.invoice_number,
      balanceDue: Number(invoice.balance_due ?? 0),
      dueDate: invoice.due_date,
      businessName: business.name,
    });

    const { data: queued, error: queueError } = await supabase.from("message_deliveries").insert({
      business_id: invoice.business_id,
      customer_id: invoice.customer_id,
      order_id: invoice.order_id,
      invoice_id: invoice.id,
      event_key: eventKey,
      provider: setting.provider,
      destination,
      message_body: message,
      status: "queued",
      idempotency_key: idempotencyKey,
      created_by: null,
    }).select("id").single();

    if (queueError) {
      if (queueError.code === "23505") {
        skipped++;
        details.push({ invoice: invoice.invoice_number, status: "skip", reason: "Sudah pernah diproses", eventKey });
        continue;
      }
      failed++;
      details.push({ invoice: invoice.invoice_number, status: "failed", reason: queueError.message });
      continue;
    }

    try {
      const result = await sendGateway(setting.provider, destination, message);
      await supabase.from("message_deliveries").update({
        status: result.ok ? "sent" : "failed",
        external_id: result.externalId,
        error_message: result.error,
        sent_at: result.ok ? new Date().toISOString() : null,
      }).eq("id", queued.id);
      if (result.ok) sent++; else failed++;
      details.push({ invoice: invoice.invoice_number, status: result.ok ? "sent" : "failed", provider: setting.provider, eventKey, error: result.error });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Gateway error";
      await supabase.from("message_deliveries").update({ status: "failed", error_message: errorMessage }).eq("id", queued.id);
      failed++;
      details.push({ invoice: invoice.invoice_number, status: "failed", provider: setting.provider, eventKey, error: errorMessage });
    }
  }

  return json({ ok: true, processed, sent, skipped, failed, details });
});
