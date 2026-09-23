-- PesanLunas v0.2.11-r1 HOTFIX
-- 1) Fix permission denied for debt_records/debt_payments
-- 2) Add Owner-only WhatsApp provider credential storage
-- 3) Tokens are entered from the PesanLunas Integrasi WhatsApp page.
-- Run once on an existing v0.2.11 database.

begin;

-- ============================================================
-- FIX HUTANG & PIUTANG TABLE PRIVILEGES
-- ============================================================
grant select, insert, update on public.debt_records to authenticated;
grant select on public.debt_payments to authenticated;

-- ============================================================
-- PRIVATE WHATSAPP CREDENTIALS
-- ============================================================
create table if not exists public.whatsapp_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual','fonnte','starsender')),
  api_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.whatsapp_integrations enable row level security;

drop policy if exists whatsapp_integrations_owner_select on public.whatsapp_integrations;
create policy whatsapp_integrations_owner_select on public.whatsapp_integrations
for select to authenticated using (public.is_business_owner(business_id));

drop policy if exists whatsapp_integrations_owner_insert on public.whatsapp_integrations;
create policy whatsapp_integrations_owner_insert on public.whatsapp_integrations
for insert to authenticated with check (public.is_business_owner(business_id));

drop policy if exists whatsapp_integrations_owner_update on public.whatsapp_integrations;
create policy whatsapp_integrations_owner_update on public.whatsapp_integrations
for update to authenticated
using (public.is_business_owner(business_id))
with check (public.is_business_owner(business_id));

drop policy if exists whatsapp_integrations_owner_delete on public.whatsapp_integrations;
create policy whatsapp_integrations_owner_delete on public.whatsapp_integrations
for delete to authenticated using (public.is_business_owner(business_id));

grant select, insert, update, delete on public.whatsapp_integrations to authenticated;

drop trigger if exists trg_whatsapp_integrations_updated_at on public.whatsapp_integrations;
create trigger trg_whatsapp_integrations_updated_at
before update on public.whatsapp_integrations
for each row execute function public.set_updated_at();

commit;
