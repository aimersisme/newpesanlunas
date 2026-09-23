import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActiveBusiness = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  timezone: string;
  whatsapp: string | null;
  sku_prefix: string;
  role: "owner" | "admin" | "staff" | "finance";
};

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type BusinessRelation = {
  id?: string;
  name?: string;
  slug?: string;
  logo_url?: string | null;
  timezone?: string | null;
  whatsapp?: string | null;
  sku_prefix?: string | null;
  deleted_at?: string | null;
};

function relationOne(value: unknown): BusinessRelation | null {
  if (Array.isArray(value)) return (value[0] as BusinessRelation | undefined) ?? null;
  if (value && typeof value === "object") return value as BusinessRelation;
  return null;
}

function asActiveBusiness(value: unknown): ActiveBusiness | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!row.id || !row.name || !row.slug || !row.role) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    logo_url: row.logo_url ? String(row.logo_url) : null,
    timezone: row.timezone ? String(row.timezone) : "Asia/Jakarta",
    whatsapp: row.whatsapp ? String(row.whatsapp) : null,
    sku_prefix: row.sku_prefix ? String(row.sku_prefix) : "SKU",
    role: String(row.role) as ActiveBusiness["role"],
  };
}

/**
 * Single-install resolver. v0.2.1 prefers the tiny no-arg RPC so each page only
 * needs one fast request for the active business. It falls back to the v0.2.0
 * query if the performance SQL patch has not been installed yet.
 */
export async function getActiveBusiness(client?: ServerSupabaseClient): Promise<ActiveBusiness> {
  let supabase: ServerSupabaseClient;
  try {
    supabase = client ?? (await createClient());
  } catch (error) {
    if (error instanceof Error && error.message === "PESANLUNAS_SUPABASE_NOT_CONFIGURED") redirect("/setup");
    throw error;
  }

  const rpc = await supabase.rpc("get_single_business_context");
  if (!rpc.error) {
    const business = asActiveBusiness(rpc.data);
    if (!business) redirect("/onboarding");
    return business;
  }

  if (rpc.error.message.includes("AUTH_REQUIRED")) redirect("/auth/login");

  // Safe fallback for databases that have not received v0.2.1 patch yet.
  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select(`business_id,role,businesses!inner(id,name,slug,logo_url,timezone,whatsapp,sku_prefix,deleted_at)`)
    .eq("status", "active")
    .is("businesses.deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    // If RLS returned no usable session, send the visitor back to login rather than a blank onboarding.
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect("/auth/login");
    throw new Error(`BUSINESS_MEMBERSHIP_QUERY_FAILED: ${membershipError.message}`);
  }
  if (!membership) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect("/auth/login");
    redirect("/onboarding");
  }

  const business = relationOne((membership as { businesses?: unknown }).businesses);
  if (!business?.id || !business.name || !business.slug) redirect("/onboarding");

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    logo_url: business.logo_url ?? null,
    timezone: business.timezone || "Asia/Jakarta",
    whatsapp: business.whatsapp ?? null,
    sku_prefix: business.sku_prefix || "SKU",
    role: membership.role as ActiveBusiness["role"],
  };
}
