-- ============================================================
-- PesanLunas — MASTER FULL Supabase Schema v1.4
-- Full fresh-install migration through app v0.2.8
-- Brand: PesanLunas
-- Tagline: Pesanan tercatat, tagihan cepat lunas.
-- Stack target: Next.js + TypeScript + Supabase + Vercel + PWA
-- ============================================================
-- IMPORTANT
-- 1) Run this file once in Supabase SQL Editor on a fresh project.
-- 2) Never expose SUPABASE_SERVICE_ROLE_KEY in the browser.
-- 3) WhatsApp provider secrets belong in server/Edge Function env secrets,
--    not in business_settings or any public/client-readable table.
-- 4) Invoice financial snapshots are immutable after issue.
-- 5) Orders with an active invoice must be voided/reissued before financial edits.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

do $$ begin
  create type public.member_role as enum ('owner','admin','staff','finance');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_status as enum ('invited','active','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('draft','confirmed','in_progress','ready','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_payment_status as enum ('unpaid','partial','paid','refunded','void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_kind as enum ('payment','refund');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_record_status as enum ('posted','voided');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.custom_field_type as enum (
    'text_short','text_long','number','money','date','time',
    'select','multiselect','boolean','phone','address','file'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.custom_field_entity_type as enum ('order','order_item');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_type as enum ('order','invoice');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_delivery_status as enum ('queued','sent','delivered','failed');
exception when duplicate_object then null; end $$;

-- ============================================================
-- CORE TABLES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.business_template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.business_templates(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type public.custom_field_type not null,
  is_required boolean not null default false,
  show_on_invoice boolean not null default false,
  customer_visible boolean not null default true,
  internal_only boolean not null default false,
  entity_type public.custom_field_entity_type not null default 'order',
  placeholder text,
  options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  unique(template_id, field_key)
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  template_slug text references public.business_templates(slug) on update cascade,
  name text not null,
  slug text not null,
  logo_url text,
  address text,
  whatsapp text,
  email text,
  timezone text not null default 'Asia/Jakarta',
  currency text not null default 'IDR',
  invoice_prefix text not null default 'INV',
  order_prefix text not null default 'ORD',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists businesses_slug_lower_uq
  on public.businesses(lower(slug)) where deleted_at is null;

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'active',
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, user_id)
);

create unique index if not exists one_active_owner_per_business
  on public.business_members(business_id)
  where role = 'owner' and status = 'active';

create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text,
  phone text,
  role public.member_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint business_invitation_target_chk check (email is not null or phone is not null)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  whatsapp text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists customers_business_name_idx on public.customers(business_id, name);
create index if not exists customers_business_whatsapp_idx on public.customers(business_id, whatsapp);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'pcs',
  price bigint not null default 0 check (price >= 0),
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists catalog_items_business_sku_uq
  on public.catalog_items(business_id, lower(sku))
  where sku is not null and deleted_at is null;

create table if not exists public.document_counters (
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_type public.document_type not null,
  counter_year integer not null,
  current_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, document_type, counter_year)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_number text not null,
  status public.order_status not null default 'confirmed',
  order_date date not null default current_date,
  expected_date date,
  due_date date,
  subtotal bigint not null default 0 check (subtotal >= 0),
  discount_total bigint not null default 0 check (discount_total >= 0),
  additional_fee_total bigint not null default 0 check (additional_fee_total >= 0),
  tax_total bigint not null default 0 check (tax_total >= 0),
  grand_total bigint not null default 0 check (grand_total >= 0),
  amount_paid bigint not null default 0 check (amount_paid >= 0),
  balance_due bigint generated always as (greatest(grand_total - amount_paid, 0)) stored,
  customer_notes text,
  internal_notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(business_id, order_number)
);

create index if not exists orders_business_status_idx on public.orders(business_id, status) where deleted_at is null;
create index if not exists orders_business_order_date_idx on public.orders(business_id, order_date desc) where deleted_at is null;
create index if not exists orders_business_customer_idx on public.orders(business_id, customer_id) where deleted_at is null;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  catalog_item_id uuid references public.catalog_items(id) on delete set null,
  name text not null,
  description text,
  qty numeric(12,3) not null default 1 check (qty > 0),
  unit text not null default 'pcs',
  unit_price bigint not null default 0 check (unit_price >= 0),
  line_discount bigint not null default 0 check (line_discount >= 0),
  line_total bigint generated always as (greatest(round(qty * unit_price)::bigint - line_discount, 0)) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists order_items_order_idx on public.order_items(order_id, sort_order) where deleted_at is null;

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type public.custom_field_type not null,
  entity_type public.custom_field_entity_type not null default 'order',
  help_text text,
  placeholder text,
  is_required boolean not null default false,
  is_active boolean not null default true,
  show_on_invoice boolean not null default false,
  customer_visible boolean not null default true,
  internal_only boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, field_key, entity_type)
);

create table if not exists public.custom_field_options (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  label text not null,
  value text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(definition_id, value)
);

create table if not exists public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  entity_type public.custom_field_entity_type not null,
  entity_id uuid not null,
  value_json jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(definition_id, entity_id)
);

create index if not exists custom_field_values_entity_idx on public.custom_field_values(business_id, entity_type, entity_id);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('cash','bank','ewallet','qris','other')),
  name text not null,
  account_name text,
  account_number text,
  instructions text,
  qr_image_path text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_number text not null,
  issue_date date not null default current_date,
  due_date date,
  subtotal bigint not null check (subtotal >= 0),
  discount_total bigint not null default 0 check (discount_total >= 0),
  additional_fee_total bigint not null default 0 check (additional_fee_total >= 0),
  tax_total bigint not null default 0 check (tax_total >= 0),
  grand_total bigint not null check (grand_total >= 0),
  amount_paid bigint not null default 0 check (amount_paid >= 0),
  balance_due bigint generated always as (greatest(grand_total - amount_paid, 0)) stored,
  payment_status public.invoice_payment_status not null default 'unpaid',
  business_snapshot jsonb not null,
  customer_snapshot jsonb not null,
  payment_methods_snapshot jsonb not null default '[]'::jsonb,
  custom_fields_snapshot jsonb not null default '[]'::jsonb,
  customer_notes_snapshot text,
  issued_by uuid references public.profiles(id) on delete set null,
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(business_id, invoice_number)
);

create unique index if not exists one_active_invoice_per_order
  on public.invoices(order_id)
  where payment_status <> 'void' and deleted_at is null;

create index if not exists invoices_business_due_idx on public.invoices(business_id, due_date)
  where deleted_at is null and payment_status not in ('paid','void','refunded');

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  source_order_item_id uuid references public.order_items(id) on delete set null,
  name text not null,
  description text,
  qty numeric(12,3) not null check (qty > 0),
  unit text not null,
  unit_price bigint not null check (unit_price >= 0),
  line_discount bigint not null default 0 check (line_discount >= 0),
  line_total bigint not null check (line_total >= 0),
  custom_fields_snapshot jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id, sort_order);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  kind public.payment_kind not null default 'payment',
  amount bigint not null check (amount > 0),
  method text not null,
  paid_at timestamptz not null default now(),
  reference text,
  note text,
  proof_path text,
  status public.payment_record_status not null default 'posted',
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_invoice_idx on public.payments(invoice_id, paid_at desc);
create index if not exists payments_business_date_idx on public.payments(business_id, paid_at desc);

create table if not exists public.invoice_public_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count bigint not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_public_links_invoice_idx on public.invoice_public_links(invoice_id);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_key text not null,
  name text not null,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, event_key, name)
);

create table if not exists public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  event_key text,
  provider text not null check (provider in ('manual','fonnte','starsender')),
  destination text not null,
  message_body text,
  status public.message_delivery_status not null default 'queued',
  external_id text,
  error_message text,
  idempotency_key text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists message_deliveries_idempotency_uq
  on public.message_deliveries(business_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  bucket text not null,
  path text not null,
  entity_type text,
  entity_id uuid,
  visibility text not null default 'internal' check (visibility in ('internal','customer')),
  original_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(bucket, path)
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_business_date_idx on public.activity_logs(business_id, created_at desc);

create table if not exists public.business_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, key)
);

comment on table public.business_settings is
  'Non-secret flexible settings only. Never store Fonnte/Starsender API tokens here.';

-- ============================================================
-- COMMON TRIGGERS
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill profiles for auth users already present.
insert into public.profiles(id, full_name, phone)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  coalesce(u.phone, u.raw_user_meta_data ->> 'phone')
from auth.users u
on conflict (id) do nothing;

-- updated_at triggers
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','businesses','business_members','customers','catalog_items','orders','order_items',
    'custom_field_definitions','custom_field_values','payment_methods','invoices','payments',
    'message_templates','business_settings'
  ]
  LOOP
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- Protect the single active owner membership and immutable membership identity.
create or replace function public.protect_business_membership_identity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.business_id is distinct from old.business_id or new.user_id is distinct from old.user_id then
      raise exception 'business_id and user_id of a membership are immutable';
    end if;
    if old.role = 'owner' and old.status = 'active'
       and (new.role <> 'owner' or new.status <> 'active') then
      raise exception 'The active owner membership cannot be demoted or suspended directly';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.role = 'owner' and old.status = 'active' then
      raise exception 'The active owner membership cannot be deleted directly';
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_protect_business_membership on public.business_members;
create trigger trg_protect_business_membership
  before update or delete on public.business_members
  for each row execute function public.protect_business_membership_identity();

-- ============================================================
-- AUTHORIZATION HELPERS (RLS-SAFE)
-- ============================================================

create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  );
$$;

create or replace function public.has_business_role(p_business_id uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
      and bm.role = any(p_roles)
  );
$$;

create or replace function public.is_business_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_business_role(p_business_id, array['owner'::public.member_role]);
$$;

create or replace function public.shares_business_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members me
    join public.business_members them on them.business_id = me.business_id
    where me.user_id = auth.uid()
      and me.status = 'active'
      and them.user_id = p_user_id
      and them.status = 'active'
  );
$$;

-- ============================================================
-- DOCUMENT NUMBERING
-- ============================================================

create or replace function public.next_document_number(
  p_business_id uuid,
  p_document_type public.document_type
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from current_date)::integer;
  v_num bigint;
  v_prefix text;
begin
  insert into public.document_counters(business_id, document_type, counter_year, current_value)
  values (p_business_id, p_document_type, v_year, 1)
  on conflict (business_id, document_type, counter_year)
  do update set current_value = public.document_counters.current_value + 1,
                updated_at = now()
  returning current_value into v_num;

  select case
    when p_document_type = 'order' then coalesce(nullif(order_prefix,''), 'ORD')
    else coalesce(nullif(invoice_prefix,''), 'INV')
  end
  into v_prefix
  from public.businesses
  where id = p_business_id;

  if v_prefix is null then
    raise exception 'Business not found';
  end if;

  return format('%s-%s-%s', upper(v_prefix), v_year, lpad(v_num::text, 6, '0'));
end;
$$;

-- Enforce tenant consistency at the database layer, not only in the UI.
create or replace function public.validate_order_tenant_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.customers c
    where c.id = new.customer_id
      and c.business_id = new.business_id
      and c.deleted_at is null
  ) then
    raise exception 'Order customer does not belong to the same business';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_order_tenant on public.orders;
create trigger trg_validate_order_tenant
  before insert or update of business_id, customer_id on public.orders
  for each row execute function public.validate_order_tenant_consistency();

create or replace function public.validate_order_item_tenant_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.orders o
    where o.id = new.order_id
      and o.business_id = new.business_id
      and o.deleted_at is null
  ) then
    raise exception 'Order item does not belong to the same business as its order';
  end if;

  if new.catalog_item_id is not null and not exists (
    select 1 from public.catalog_items ci
    where ci.id = new.catalog_item_id
      and ci.business_id = new.business_id
      and ci.deleted_at is null
  ) then
    raise exception 'Catalog item does not belong to the same business';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_order_item_tenant on public.order_items;
create trigger trg_validate_order_item_tenant
  before insert or update of business_id, order_id, catalog_item_id on public.order_items
  for each row execute function public.validate_order_item_tenant_consistency();

create or replace function public.validate_custom_field_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def public.custom_field_definitions%rowtype;
begin
  select * into v_def
  from public.custom_field_definitions
  where id = new.definition_id;

  if not found then raise exception 'Custom field definition not found'; end if;
  if v_def.business_id <> new.business_id or v_def.entity_type <> new.entity_type then
    raise exception 'Custom field definition tenant/entity mismatch';
  end if;

  if new.entity_type = 'order' then
    if not exists (select 1 from public.orders o where o.id = new.entity_id and o.business_id = new.business_id and o.deleted_at is null) then
      raise exception 'Custom field target order not found in this business';
    end if;
  elsif new.entity_type = 'order_item' then
    if not exists (select 1 from public.order_items oi where oi.id = new.entity_id and oi.business_id = new.business_id and oi.deleted_at is null) then
      raise exception 'Custom field target order item not found in this business';
    end if;
  end if;

  if new.value_json is not null and new.value_json <> 'null'::jsonb then
    if v_def.field_type in ('number','money') and jsonb_typeof(new.value_json) <> 'number' then
      raise exception 'Custom field % requires a numeric JSON value', v_def.label;
    elsif v_def.field_type = 'boolean' and jsonb_typeof(new.value_json) <> 'boolean' then
      raise exception 'Custom field % requires a boolean JSON value', v_def.label;
    elsif v_def.field_type = 'multiselect' and jsonb_typeof(new.value_json) <> 'array' then
      raise exception 'Custom field % requires an array JSON value', v_def.label;
    elsif v_def.field_type in ('text_short','text_long','date','time','select','phone','address','file')
          and jsonb_typeof(new.value_json) <> 'string' then
      raise exception 'Custom field % requires a string JSON value', v_def.label;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_custom_field_value on public.custom_field_values;
create trigger trg_validate_custom_field_value
  before insert or update on public.custom_field_values
  for each row execute function public.validate_custom_field_value();

-- ============================================================
-- ORDER TOTALS + SNAPSHOT GUARDS
-- ============================================================

create or replace function public.recalculate_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subtotal bigint;
begin
  select coalesce(sum(oi.line_total),0)::bigint
  into v_subtotal
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.deleted_at is null;

  update public.orders o
  set subtotal = v_subtotal,
      grand_total = greatest(v_subtotal - o.discount_total + o.additional_fee_total + o.tax_total, 0),
      updated_at = now()
  where o.id = p_order_id;
end;
$$;

create or replace function public.trg_recalculate_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_order_totals(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_order_items_recalc on public.order_items;
create trigger trg_order_items_recalc
  after insert or update or delete on public.order_items
  for each row execute function public.trg_recalculate_order_totals();

create or replace function public.order_has_active_invoice(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invoices i
    where i.order_id = p_order_id
      and i.deleted_at is null
      and i.payment_status <> 'void'
  );
$$;

create or replace function public.prevent_locked_order_financial_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.order_has_active_invoice(old.id) then
    if new.customer_id is distinct from old.customer_id
       or new.order_date is distinct from old.order_date
       or new.expected_date is distinct from old.expected_date
       or new.due_date is distinct from old.due_date
       or new.discount_total is distinct from old.discount_total
       or new.additional_fee_total is distinct from old.additional_fee_total
       or new.tax_total is distinct from old.tax_total
       or new.customer_notes is distinct from old.customer_notes then
      raise exception 'Order financial/customer data is locked because an active invoice exists. Void the invoice, edit the order, then reissue.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_lock_after_invoice on public.orders;
create trigger trg_orders_lock_after_invoice
  before update on public.orders
  for each row execute function public.prevent_locked_order_financial_change();

create or replace function public.prevent_order_item_change_with_active_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
begin
  if public.order_has_active_invoice(v_order_id) then
    raise exception 'Order items are locked because an active invoice exists. Void the invoice before editing items.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_order_items_lock_after_invoice on public.order_items;
create trigger trg_order_items_lock_after_invoice
  before insert or update or delete on public.order_items
  for each row execute function public.prevent_order_item_change_with_active_invoice();

create or replace function public.prevent_invoice_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.business_id is distinct from old.business_id
     or new.order_id is distinct from old.order_id
     or new.customer_id is distinct from old.customer_id
     or new.invoice_number is distinct from old.invoice_number
     or new.issue_date is distinct from old.issue_date
     or new.due_date is distinct from old.due_date
     or new.subtotal is distinct from old.subtotal
     or new.discount_total is distinct from old.discount_total
     or new.additional_fee_total is distinct from old.additional_fee_total
     or new.tax_total is distinct from old.tax_total
     or new.grand_total is distinct from old.grand_total
     or new.business_snapshot is distinct from old.business_snapshot
     or new.customer_snapshot is distinct from old.customer_snapshot
     or new.payment_methods_snapshot is distinct from old.payment_methods_snapshot
     or new.custom_fields_snapshot is distinct from old.custom_fields_snapshot
     or new.customer_notes_snapshot is distinct from old.customer_notes_snapshot
  then
    raise exception 'Issued invoice snapshot is immutable. Void and reissue instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoice_snapshot_immutable on public.invoices;
create trigger trg_invoice_snapshot_immutable
  before update on public.invoices
  for each row execute function public.prevent_invoice_snapshot_mutation();

create or replace function public.prevent_invoice_item_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Invoice item snapshot is immutable. Void and reissue the invoice instead.';
end;
$$;

drop trigger if exists trg_invoice_items_immutable on public.invoice_items;
create trigger trg_invoice_items_immutable
  before update or delete on public.invoice_items
  for each row execute function public.prevent_invoice_item_mutation();

-- ============================================================
-- BUSINESS CREATION + TEMPLATE SEEDING
-- ============================================================

create or replace function public.create_business(
  p_name text,
  p_slug text,
  p_template_slug text default 'catering'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_business_id uuid;
  v_template_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(p_name),'') is null or nullif(trim(p_slug),'') is null then
    raise exception 'Business name and slug are required';
  end if;

  if not exists (select 1 from public.profiles where id = v_user) then
    insert into public.profiles(id) values (v_user) on conflict do nothing;
  end if;

  select id into v_template_id
  from public.business_templates
  where slug = p_template_slug and is_active = true;

  if v_template_id is null and p_template_slug <> 'blank' then
    raise exception 'Unknown or inactive business template: %', p_template_slug;
  end if;

  insert into public.businesses(owner_user_id, template_slug, name, slug)
  values (v_user, p_template_slug, trim(p_name), lower(trim(p_slug)))
  returning id into v_business_id;

  insert into public.business_members(business_id, user_id, role, status, joined_at)
  values (v_business_id, v_user, 'owner', 'active', now());

  if v_template_id is not null then
    insert into public.custom_field_definitions(
      business_id, field_key, label, field_type, entity_type, placeholder,
      is_required, show_on_invoice, customer_visible, internal_only, sort_order
    )
    select
      v_business_id, tf.field_key, tf.label, tf.field_type, tf.entity_type, tf.placeholder,
      tf.is_required, tf.show_on_invoice, tf.customer_visible, tf.internal_only, tf.sort_order
    from public.business_template_fields tf
    where tf.template_id = v_template_id
    order by tf.sort_order;

    insert into public.custom_field_options(business_id, definition_id, label, value, sort_order)
    select
      v_business_id,
      d.id,
      x.value ->> 'label',
      coalesce(x.value ->> 'value', x.value ->> 'label'),
      (x.ordinality - 1)::integer
    from public.business_template_fields tf
    join public.custom_field_definitions d
      on d.business_id = v_business_id
     and d.field_key = tf.field_key
     and d.entity_type = tf.entity_type
    cross join lateral jsonb_array_elements(tf.options) with ordinality as x(value, ordinality)
    where tf.template_id = v_template_id
      and jsonb_array_length(tf.options) > 0;
  end if;

  insert into public.message_templates(business_id, event_key, name, body)
  values
    (v_business_id, 'invoice_issued', 'Invoice Baru',
      'Halo {{customer_name}}, invoice {{invoice_number}} sebesar {{grand_total}} sudah dibuat. Sisa tagihan: {{balance_due}}. {{invoice_url}}'),
    (v_business_id, 'due_reminder', 'Pengingat Jatuh Tempo',
      'Halo {{customer_name}}, pengingat untuk tagihan {{invoice_number}} dengan sisa {{balance_due}} yang jatuh tempo {{due_date}}. {{invoice_url}}'),
    (v_business_id, 'payment_received', 'Pembayaran Diterima',
      'Terima kasih {{customer_name}}. Pembayaran {{payment_amount}} untuk {{invoice_number}} sudah kami catat. Sisa tagihan: {{balance_due}}.'),
    (v_business_id, 'order_ready', 'Pesanan Siap',
      'Halo {{customer_name}}, pesanan {{order_number}} sudah siap. Terima kasih sudah berbelanja bersama kami.');

  insert into public.business_settings(business_id, key, value)
  values
    (v_business_id, 'ui', jsonb_build_object('theme','emerald','mobile_first',true)),
    (v_business_id, 'whatsapp', jsonb_build_object('provider','manual','auto_send_enabled',false)),
    (v_business_id, 'invoice', jsonb_build_object('show_logo',true,'show_payment_history',true));

  return v_business_id;
end;
$$;

-- ============================================================
-- INVOICE ISSUANCE + PAYMENT ENGINE
-- ============================================================

create or replace function public.issue_invoice(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_business public.businesses%rowtype;
  v_invoice_id uuid;
  v_invoice_number text;
  v_payment_methods jsonb := '[]'::jsonb;
  v_custom_fields jsonb := '[]'::jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id and deleted_at is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if not public.has_business_role(v_order.business_id,
    array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role,'finance'::public.member_role]) then
    raise exception 'Not authorized to issue invoice';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Cannot issue invoice for cancelled order';
  end if;

  if exists (
    select 1 from public.invoices
    where order_id = p_order_id and payment_status <> 'void' and deleted_at is null
  ) then
    raise exception 'An active invoice already exists for this order';
  end if;

  perform public.recalculate_order_totals(p_order_id);
  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.grand_total < 0 then
    raise exception 'Invalid order total';
  end if;

  select * into v_customer from public.customers where id = v_order.customer_id and business_id = v_order.business_id;
  if not found then raise exception 'Customer not found'; end if;

  select * into v_business from public.businesses where id = v_order.business_id and deleted_at is null;
  if not found then raise exception 'Business not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'type', pm.type,
    'name', pm.name,
    'account_name', pm.account_name,
    'account_number', pm.account_number,
    'instructions', pm.instructions,
    'qr_image_path', pm.qr_image_path
  ) order by pm.sort_order), '[]'::jsonb)
  into v_payment_methods
  from public.payment_methods pm
  where pm.business_id = v_order.business_id and pm.is_active = true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', d.field_key,
    'label', d.label,
    'type', d.field_type,
    'value', cv.value_json
  ) order by d.sort_order), '[]'::jsonb)
  into v_custom_fields
  from public.custom_field_values cv
  join public.custom_field_definitions d on d.id = cv.definition_id
  where cv.business_id = v_order.business_id
    and cv.entity_type = 'order'
    and cv.entity_id = v_order.id
    and d.show_on_invoice = true
    and d.is_active = true
    and d.internal_only = false;

  v_invoice_number := public.next_document_number(v_order.business_id, 'invoice');

  insert into public.invoices(
    business_id, order_id, customer_id, invoice_number, issue_date, due_date,
    subtotal, discount_total, additional_fee_total, tax_total, grand_total, amount_paid,
    payment_status, business_snapshot, customer_snapshot, payment_methods_snapshot,
    custom_fields_snapshot, customer_notes_snapshot, issued_by
  )
  values (
    v_order.business_id, v_order.id, v_order.customer_id, v_invoice_number, current_date, v_order.due_date,
    v_order.subtotal, v_order.discount_total, v_order.additional_fee_total, v_order.tax_total, v_order.grand_total, 0,
    'unpaid',
    jsonb_build_object(
      'name', v_business.name,
      'logo_url', v_business.logo_url,
      'address', v_business.address,
      'whatsapp', v_business.whatsapp,
      'email', v_business.email,
      'currency', v_business.currency
    ),
    jsonb_build_object(
      'name', v_customer.name,
      'whatsapp', v_customer.whatsapp,
      'email', v_customer.email,
      'address', v_customer.address
    ),
    v_payment_methods,
    v_custom_fields,
    v_order.customer_notes,
    auth.uid()
  )
  returning id into v_invoice_id;

  insert into public.invoice_items(
    business_id, invoice_id, source_order_item_id, name, description, qty, unit,
    unit_price, line_discount, line_total, custom_fields_snapshot, sort_order
  )
  select
    oi.business_id,
    v_invoice_id,
    oi.id,
    oi.name,
    oi.description,
    oi.qty,
    oi.unit,
    oi.unit_price,
    oi.line_discount,
    oi.line_total,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', d.field_key,
        'label', d.label,
        'type', d.field_type,
        'value', cv.value_json
      ) order by d.sort_order)
      from public.custom_field_values cv
      join public.custom_field_definitions d on d.id = cv.definition_id
      where cv.business_id = oi.business_id
        and cv.entity_type = 'order_item'
        and cv.entity_id = oi.id
        and d.show_on_invoice = true
        and d.is_active = true
        and d.internal_only = false
    ), '[]'::jsonb),
    oi.sort_order
  from public.order_items oi
  where oi.order_id = v_order.id and oi.deleted_at is null
  order by oi.sort_order, oi.created_at;

  insert into public.activity_logs(business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_order.business_id, auth.uid(), 'invoice.issued', 'invoice', v_invoice_id,
    jsonb_build_object('invoice_number', v_invoice_number, 'order_id', v_order.id, 'grand_total', v_order.grand_total));

  return v_invoice_id;
end;
$$;

create or replace function public.sync_invoice_payment_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_payments bigint := 0;
  v_refunds bigint := 0;
  v_net bigint := 0;
  v_status public.invoice_payment_status;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;

  select
    coalesce(sum(case when kind='payment' and status='posted' then amount else 0 end),0)::bigint,
    coalesce(sum(case when kind='refund' and status='posted' then amount else 0 end),0)::bigint
  into v_payments, v_refunds
  from public.payments
  where invoice_id = p_invoice_id;

  v_net := greatest(v_payments - v_refunds, 0);

  if v_invoice.payment_status = 'void' then
    v_status := 'void';
  elsif v_net = 0 and v_refunds > 0 then
    v_status := 'refunded';
  elsif v_net = 0 then
    v_status := 'unpaid';
  elsif v_net >= v_invoice.grand_total then
    v_status := 'paid';
  else
    v_status := 'partial';
  end if;

  update public.invoices
  set amount_paid = least(v_net, grand_total),
      payment_status = v_status,
      updated_at = now()
  where id = p_invoice_id;

  if v_status <> 'void' then
    update public.orders
    set amount_paid = least(v_net, grand_total),
        updated_at = now()
    where id = v_invoice.order_id;
  else
    update public.orders
    set amount_paid = 0,
        updated_at = now()
    where id = v_invoice.order_id;
  end if;
end;
$$;

create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount bigint,
  p_method text,
  p_paid_at timestamptz default now(),
  p_reference text default null,
  p_note text default null,
  p_proof_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_balance bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Invoice not found'; end if;

  if not public.has_business_role(v_invoice.business_id,
    array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role]) then
    raise exception 'Not authorized to record payment';
  end if;

  if v_invoice.payment_status = 'void' then raise exception 'Cannot pay a void invoice'; end if;

  perform public.sync_invoice_payment_totals(p_invoice_id);
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  v_balance := v_invoice.balance_due;

  if p_amount > v_balance then
    raise exception 'Payment exceeds remaining balance (%). Overpayment is not enabled in MVP.', v_balance;
  end if;

  insert into public.payments(
    business_id, invoice_id, order_id, kind, amount, method, paid_at,
    reference, note, proof_path, status, created_by
  )
  values (
    v_invoice.business_id, v_invoice.id, v_invoice.order_id, 'payment', p_amount,
    coalesce(nullif(trim(p_method),''),'other'), coalesce(p_paid_at,now()),
    p_reference, p_note, p_proof_path, 'posted', auth.uid()
  )
  returning id into v_payment_id;

  perform public.sync_invoice_payment_totals(p_invoice_id);

  insert into public.activity_logs(business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_invoice.business_id, auth.uid(), 'payment.recorded', 'payment', v_payment_id,
    jsonb_build_object('invoice_id', v_invoice.id, 'amount', p_amount, 'method', p_method));

  return v_payment_id;
end;
$$;

create or replace function public.record_refund(
  p_invoice_id uuid,
  p_amount bigint,
  p_method text,
  p_paid_at timestamptz default now(),
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_refund_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Refund amount must be greater than zero'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Invoice not found'; end if;

  if not public.has_business_role(v_invoice.business_id,
    array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role]) then
    raise exception 'Not authorized to record refund';
  end if;

  perform public.sync_invoice_payment_totals(p_invoice_id);
  select * into v_invoice from public.invoices where id = p_invoice_id for update;

  if p_amount > v_invoice.amount_paid then
    raise exception 'Refund exceeds net amount paid (%)', v_invoice.amount_paid;
  end if;

  insert into public.payments(
    business_id, invoice_id, order_id, kind, amount, method, paid_at,
    reference, note, status, created_by
  )
  values (
    v_invoice.business_id, v_invoice.id, v_invoice.order_id, 'refund', p_amount,
    coalesce(nullif(trim(p_method),''),'other'), coalesce(p_paid_at,now()),
    p_reference, p_note, 'posted', auth.uid()
  )
  returning id into v_refund_id;

  perform public.sync_invoice_payment_totals(p_invoice_id);

  insert into public.activity_logs(business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_invoice.business_id, auth.uid(), 'payment.refunded', 'payment', v_refund_id,
    jsonb_build_object('invoice_id', v_invoice.id, 'amount', p_amount, 'method', p_method));

  return v_refund_id;
end;
$$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;

  if not public.has_business_role(v_payment.business_id,
    array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role]) then
    raise exception 'Not authorized to void payment';
  end if;

  if v_payment.status = 'voided' then return; end if;

  update public.payments
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = nullif(trim(p_reason),''), updated_at = now()
  where id = p_payment_id;

  perform public.sync_invoice_payment_totals(v_payment.invoice_id);

  insert into public.activity_logs(business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_payment.business_id, auth.uid(), 'payment.voided', 'payment', v_payment.id,
    jsonb_build_object('invoice_id', v_payment.invoice_id, 'reason', p_reason));
end;
$$;

create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_net bigint;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Invoice not found'; end if;

  if not public.has_business_role(v_invoice.business_id,
    array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role]) then
    raise exception 'Not authorized to void invoice';
  end if;

  perform public.sync_invoice_payment_totals(p_invoice_id);
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  v_net := v_invoice.amount_paid;

  if v_net > 0 then
    raise exception 'Invoice still has net payment of %. Refund or void payments first.', v_net;
  end if;

  update public.invoices
  set payment_status = 'void',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = nullif(trim(p_reason),''),
      updated_at = now()
  where id = p_invoice_id;

  update public.orders set amount_paid = 0, updated_at = now() where id = v_invoice.order_id;

  insert into public.activity_logs(business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_invoice.business_id, auth.uid(), 'invoice.voided', 'invoice', v_invoice.id,
    jsonb_build_object('reason', p_reason, 'order_id', v_invoice.order_id));
end;
$$;

-- ============================================================
-- ATOMIC ORDER CREATION
-- payload example:
-- {
--   "customer_id":"uuid",
--   "order_date":"2026-09-22",
--   "expected_date":"2026-09-25",
--   "due_date":"2026-09-25",
--   "discount_total":0,
--   "additional_fee_total":0,
--   "tax_total":0,
--   "customer_notes":"...",
--   "internal_notes":"...",
--   "items":[{"name":"Risoles ayam","qty":10,"unit":"pcs","unit_price":10000,"line_discount":0}],
--   "custom_fields":[{"definition_id":"uuid","value":"2026-09-25"}],
--   "initial_payment":{"amount":50000,"method":"transfer","reference":"..."}
-- }
-- ============================================================

create or replace function public.create_order(p_business_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_order_number text;
  v_customer_id uuid;
  v_item jsonb;
  v_cf jsonb;
  v_initial jsonb;
  v_initial_amount bigint := 0;
  v_role_can_take_payment boolean;
begin
  if not public.has_business_role(p_business_id,
    array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]) then
    raise exception 'Not authorized to create orders';
  end if;

  v_customer_id := nullif(p_payload ->> 'customer_id','')::uuid;
  if v_customer_id is null then raise exception 'customer_id is required'; end if;

  if not exists (
    select 1 from public.customers c
    where c.id = v_customer_id and c.business_id = p_business_id and c.deleted_at is null
  ) then
    raise exception 'Customer does not belong to this business';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'items','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payload -> 'items','[]'::jsonb)) = 0 then
    raise exception 'At least one order item is required';
  end if;

  v_order_number := public.next_document_number(p_business_id, 'order');

  insert into public.orders(
    business_id, customer_id, order_number, status, order_date, expected_date, due_date,
    discount_total, additional_fee_total, tax_total, customer_notes, internal_notes, created_by
  )
  values (
    p_business_id,
    v_customer_id,
    v_order_number,
    coalesce(nullif(p_payload ->> 'status','')::public.order_status, 'confirmed'),
    coalesce(nullif(p_payload ->> 'order_date','')::date, current_date),
    nullif(p_payload ->> 'expected_date','')::date,
    nullif(p_payload ->> 'due_date','')::date,
    greatest(coalesce((p_payload ->> 'discount_total')::bigint,0),0),
    greatest(coalesce((p_payload ->> 'additional_fee_total')::bigint,0),0),
    greatest(coalesce((p_payload ->> 'tax_total')::bigint,0),0),
    p_payload ->> 'customer_notes',
    p_payload ->> 'internal_notes',
    auth.uid()
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_payload -> 'items')
  loop
    if nullif(trim(v_item ->> 'name'),'') is null then raise exception 'Every item requires a name'; end if;

    insert into public.order_items(
      business_id, order_id, catalog_item_id, name, description, qty, unit,
      unit_price, line_discount, sort_order
    )
    values (
      p_business_id,
      v_order_id,
      nullif(v_item ->> 'catalog_item_id','')::uuid,
      trim(v_item ->> 'name'),
      v_item ->> 'description',
      coalesce((v_item ->> 'qty')::numeric,1),
      coalesce(nullif(v_item ->> 'unit',''),'pcs'),
      greatest(coalesce((v_item ->> 'unit_price')::bigint,0),0),
      greatest(coalesce((v_item ->> 'line_discount')::bigint,0),0),
      coalesce((v_item ->> 'sort_order')::integer,0)
    );
  end loop;

  for v_cf in select value from jsonb_array_elements(coalesce(p_payload -> 'custom_fields','[]'::jsonb))
  loop
    if not exists (
      select 1 from public.custom_field_definitions d
      where d.id = nullif(v_cf ->> 'definition_id','')::uuid
        and d.business_id = p_business_id
        and d.entity_type = 'order'
        and d.is_active = true
    ) then
      raise exception 'Invalid custom field definition';
    end if;

    insert into public.custom_field_values(business_id, definition_id, entity_type, entity_id, value_json, created_by)
    values (
      p_business_id,
      (v_cf ->> 'definition_id')::uuid,
      'order',
      v_order_id,
      coalesce(v_cf -> 'value','null'::jsonb),
      auth.uid()
    )
    on conflict (definition_id, entity_id)
    do update set value_json = excluded.value_json, updated_at = now();
  end loop;

  if exists (
    select 1
    from public.custom_field_definitions d
    where d.business_id = p_business_id
      and d.entity_type = 'order'
      and d.is_active = true
      and d.is_required = true
      and not exists (
        select 1 from public.custom_field_values cv
        where cv.definition_id = d.id
          and cv.entity_id = v_order_id
          and cv.value_json is not null
          and cv.value_json <> 'null'::jsonb
          and cv.value_json <> '""'::jsonb
      )
  ) then
    raise exception 'One or more required custom fields are missing';
  end if;

  perform public.recalculate_order_totals(v_order_id);
  v_invoice_id := public.issue_invoice(v_order_id);

  v_initial := p_payload -> 'initial_payment';
  if v_initial is not null and jsonb_typeof(v_initial) = 'object' then
    v_initial_amount := greatest(coalesce((v_initial ->> 'amount')::bigint,0),0);
    if v_initial_amount > 0 then
      v_role_can_take_payment := public.has_business_role(p_business_id,
        array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role]);
      if not v_role_can_take_payment then
        raise exception 'This role may create orders but cannot record payments. Save the order without initial_payment.';
      end if;

      v_payment_id := public.record_payment(
        v_invoice_id,
        v_initial_amount,
        coalesce(v_initial ->> 'method','other'),
        coalesce(nullif(v_initial ->> 'paid_at','')::timestamptz, now()),
        v_initial ->> 'reference',
        v_initial ->> 'note',
        v_initial ->> 'proof_path'
      );
    end if;
  end if;

  insert into public.activity_logs(business_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_business_id, auth.uid(), 'order.created', 'order', v_order_id,
    jsonb_build_object('order_number', v_order_number, 'invoice_id', v_invoice_id));

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'invoice_id', v_invoice_id,
    'payment_id', v_payment_id
  );
end;
$$;

-- ============================================================
-- PUBLIC INVOICE LINKS
-- No anonymous table policy is needed. Token resolution happens via RPC.
-- ============================================================

create or replace function public.create_invoice_public_link(
  p_invoice_id uuid,
  p_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_token text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id and deleted_at is null;
  if not found then raise exception 'Invoice not found'; end if;

  if not public.has_business_role(v_invoice.business_id,
    array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role,'finance'::public.member_role]) then
    raise exception 'Not authorized';
  end if;

  if v_invoice.payment_status = 'void' then raise exception 'Cannot share a void invoice'; end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.invoice_public_links(business_id, invoice_id, token_hash, expires_at, created_by)
  values (v_invoice.business_id, v_invoice.id, encode(digest(v_token, 'sha256'),'hex'), p_expires_at, auth.uid());

  return v_token;
end;
$$;

create or replace function public.resolve_public_invoice(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.invoice_public_links%rowtype;
  v_invoice public.invoices%rowtype;
  v_items jsonb;
  v_payments jsonb;
begin
  if nullif(trim(p_token),'') is null then return null; end if;

  select * into v_link
  from public.invoice_public_links
  where token_hash = encode(digest(p_token, 'sha256'),'hex')
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then return null; end if;

  select * into v_invoice
  from public.invoices
  where id = v_link.invoice_id
    and deleted_at is null
    and payment_status <> 'void';

  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', ii.name,
    'description', ii.description,
    'qty', ii.qty,
    'unit', ii.unit,
    'unit_price', ii.unit_price,
    'line_discount', ii.line_discount,
    'line_total', ii.line_total,
    'custom_fields', ii.custom_fields_snapshot
  ) order by ii.sort_order, ii.created_at), '[]'::jsonb)
  into v_items
  from public.invoice_items ii
  where ii.invoice_id = v_invoice.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', p.kind,
    'amount', p.amount,
    'method', p.method,
    'paid_at', p.paid_at
  ) order by p.paid_at), '[]'::jsonb)
  into v_payments
  from public.payments p
  where p.invoice_id = v_invoice.id and p.status = 'posted';

  update public.invoice_public_links
  set view_count = view_count + 1, last_viewed_at = now()
  where id = v_link.id;

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'issue_date', v_invoice.issue_date,
    'due_date', v_invoice.due_date,
    'subtotal', v_invoice.subtotal,
    'discount_total', v_invoice.discount_total,
    'additional_fee_total', v_invoice.additional_fee_total,
    'tax_total', v_invoice.tax_total,
    'grand_total', v_invoice.grand_total,
    'amount_paid', v_invoice.amount_paid,
    'balance_due', v_invoice.balance_due,
    'payment_status', case
      when v_invoice.payment_status not in ('paid','void','refunded')
       and v_invoice.due_date is not null
       and v_invoice.due_date < current_date then 'overdue'
      else v_invoice.payment_status::text
    end,
    'business', v_invoice.business_snapshot,
    'customer', v_invoice.customer_snapshot,
    'payment_methods', v_invoice.payment_methods_snapshot,
    'custom_fields', v_invoice.custom_fields_snapshot,
    'customer_notes', v_invoice.customer_notes_snapshot,
    'items', v_items,
    'payments', v_payments
  );
end;
$$;

-- ============================================================
-- DASHBOARD / RECEIVABLES
-- ============================================================

create or replace view public.v_receivables
with (security_invoker = true)
as
select
  i.id as invoice_id,
  i.business_id,
  i.order_id,
  i.customer_id,
  i.invoice_number,
  i.issue_date,
  i.due_date,
  i.grand_total,
  i.amount_paid,
  i.balance_due,
  case
    when i.payment_status not in ('paid','void','refunded')
     and i.due_date is not null
     and i.due_date < current_date then 'overdue'
    else i.payment_status::text
  end as effective_payment_status,
  case
    when i.payment_status in ('paid','void','refunded') or i.due_date is null then null
    else current_date - i.due_date
  end as days_from_due,
  c.name as customer_name,
  c.whatsapp as customer_whatsapp
from public.invoices i
join public.customers c on c.id = i.customer_id
where i.deleted_at is null
  and i.payment_status <> 'void';

create or replace function public.get_dashboard_summary(
  p_business_id uuid,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, date_trunc('month', current_date)::date);
  v_to date := coalesce(p_to, current_date);
  v_today date;
  v_result jsonb;
begin
  if not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;

  select (now() at time zone b.timezone)::date into v_today
  from public.businesses b where b.id = p_business_id;

  select jsonb_build_object(
    'order_today', (
      select count(*) from public.orders o
      where o.business_id = p_business_id and o.deleted_at is null and o.order_date = v_today
    ),
    'order_need_process', (
      select count(*) from public.orders o
      where o.business_id = p_business_id and o.deleted_at is null and o.status in ('confirmed','in_progress','ready')
    ),
    'order_value_period', (
      select coalesce(sum(o.grand_total),0) from public.orders o
      where o.business_id = p_business_id and o.deleted_at is null and o.order_date between v_from and v_to and o.status <> 'cancelled'
    ),
    'cash_received_period', (
      select coalesce(sum(case when p.kind='payment' then p.amount else -p.amount end),0)
      from public.payments p
      where p.business_id = p_business_id and p.status='posted' and p.paid_at::date between v_from and v_to
    ),
    'active_receivables', (
      select coalesce(sum(i.balance_due),0) from public.invoices i
      where i.business_id = p_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial')
    ),
    'due_today', (
      select count(*) from public.invoices i
      where i.business_id = p_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial') and i.due_date = v_today
    ),
    'overdue', (
      select count(*) from public.invoices i
      where i.business_id = p_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial') and i.due_date < v_today
    ),
    'range', jsonb_build_object('from',v_from,'to',v_to)
  ) into v_result;

  return v_result;
end;
$$;

-- ============================================================
-- SEED BUSINESS TEMPLATES
-- ============================================================

insert into public.business_templates(slug, name, description, sort_order)
values
  ('catering','Katering & Kue','Pesanan makanan, kue, snack box, katering acara',10),
  ('printing','Percetakan','Cetak, merchandise, banner, undangan, produk custom',20),
  ('convection','Konveksi & Jahit','Kaos, seragam, jahit, bordir, apparel custom',30),
  ('workshop','Bengkel & Service','Servis kendaraan/peralatan dan pekerjaan berbasis keluhan',40),
  ('supplier','Supplier & Distributor','Order B2B, PO, termin dan pengiriman',50),
  ('service','Jasa Umum','Jasa berbasis jadwal, lokasi, PIC dan deadline',60),
  ('blank','Template Kosong','Mulai tanpa custom field bawaan',99)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

-- helper inserts for template fields
insert into public.business_template_fields(
  template_id, field_key, label, field_type, is_required, show_on_invoice,
  customer_visible, internal_only, entity_type, placeholder, options, sort_order
)
select t.id, x.field_key, x.label, x.field_type::public.custom_field_type, x.is_required,
       x.show_on_invoice, x.customer_visible, x.internal_only,
       x.entity_type::public.custom_field_entity_type, x.placeholder, x.options, x.sort_order
from public.business_templates t
join (values
  ('catering','event_date','Tanggal Acara','date',true,true,true,false,'order',null,'[]'::jsonb,10),
  ('catering','delivery_time','Waktu Kirim / Ambil','time',false,true,true,false,'order',null,'[]'::jsonb,20),
  ('catering','portions','Jumlah Porsi','number',false,true,true,false,'order','Contoh: 50','[]'::jsonb,30),
  ('catering','delivery_address','Alamat Kirim','address',false,true,true,false,'order','Alamat lengkap','[]'::jsonb,40),
  ('catering','allergy_notes','Catatan Alergi / Khusus','text_long',false,true,true,false,'order','Contoh: tanpa kacang','[]'::jsonb,50),

  ('printing','size','Ukuran','text_short',false,true,true,false,'order','Contoh: A4 / 60x160 cm','[]'::jsonb,10),
  ('printing','material','Bahan','text_short',false,true,true,false,'order','Contoh: Art Paper 260 gsm','[]'::jsonb,20),
  ('printing','finishing','Finishing','text_short',false,true,true,false,'order','Contoh: Laminasi doff','[]'::jsonb,30),
  ('printing','print_qty','Jumlah Cetak','number',false,true,true,false,'order',null,'[]'::jsonb,40),
  ('printing','deadline','Deadline','date',false,true,true,false,'order',null,'[]'::jsonb,50),
  ('printing','design_file','File Desain','file',false,false,false,true,'order',null,'[]'::jsonb,60),

  ('convection','material','Bahan','text_short',false,true,true,false,'order',null,'[]'::jsonb,10),
  ('convection','color','Warna','text_short',false,true,true,false,'order',null,'[]'::jsonb,20),
  ('convection','size','Ukuran','text_short',false,true,true,false,'order','S/M/L/XL atau ukuran custom','[]'::jsonb,30),
  ('convection','qty','Jumlah','number',false,true,true,false,'order',null,'[]'::jsonb,40),
  ('convection','design_file','File Desain','file',false,false,false,true,'order',null,'[]'::jsonb,50),
  ('convection','deadline','Deadline','date',false,true,true,false,'order',null,'[]'::jsonb,60),

  ('workshop','vehicle','Kendaraan / Unit','text_short',true,true,true,false,'order','Contoh: Toyota Avanza','[]'::jsonb,10),
  ('workshop','plate_number','Nomor Polisi / Nomor Unit','text_short',false,true,true,false,'order',null,'[]'::jsonb,20),
  ('workshop','mileage','Kilometer','number',false,false,false,true,'order',null,'[]'::jsonb,30),
  ('workshop','complaint','Keluhan','text_long',true,true,true,false,'order','Keluhan pelanggan','[]'::jsonb,40),
  ('workshop','estimated_finish','Estimasi Selesai','date',false,true,true,false,'order',null,'[]'::jsonb,50),

  ('supplier','po_number','Nomor PO','text_short',false,true,true,false,'order',null,'[]'::jsonb,10),
  ('supplier','pic','Sales / PIC','text_short',false,true,true,false,'order',null,'[]'::jsonb,20),
  ('supplier','payment_term','Termin Pembayaran','text_short',false,true,true,false,'order','Contoh: NET 30','[]'::jsonb,30),
  ('supplier','delivery_address','Alamat Kirim','address',false,true,true,false,'order',null,'[]'::jsonb,40),

  ('service','schedule','Jadwal','date',false,true,true,false,'order',null,'[]'::jsonb,10),
  ('service','location','Lokasi','address',false,true,true,false,'order',null,'[]'::jsonb,20),
  ('service','pic','PIC','text_short',false,true,true,false,'order',null,'[]'::jsonb,30),
  ('service','scope','Ruang Lingkup','text_long',false,true,true,false,'order',null,'[]'::jsonb,40),
  ('service','deadline','Deadline','date',false,true,true,false,'order',null,'[]'::jsonb,50)
) as x(template_slug, field_key, label, field_type, is_required, show_on_invoice,
       customer_visible, internal_only, entity_type, placeholder, options, sort_order)
  on x.template_slug = t.slug
on conflict (template_id, field_key) do update set
  label = excluded.label,
  field_type = excluded.field_type,
  is_required = excluded.is_required,
  show_on_invoice = excluded.show_on_invoice,
  customer_visible = excluded.customer_visible,
  internal_only = excluded.internal_only,
  entity_type = excluded.entity_type,
  placeholder = excluded.placeholder,
  options = excluded.options,
  sort_order = excluded.sort_order;

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.business_templates enable row level security;
alter table public.business_template_fields enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_invitations enable row level security;
alter table public.customers enable row level security;
alter table public.catalog_items enable row level security;
alter table public.document_counters enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_options enable row level security;
alter table public.custom_field_values enable row level security;
alter table public.payment_methods enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.invoice_public_links enable row level security;
alter table public.message_templates enable row level security;
alter table public.message_deliveries enable row level security;
alter table public.files enable row level security;
alter table public.activity_logs enable row level security;
alter table public.business_settings enable row level security;

-- Profiles
create policy profiles_select_self_or_team on public.profiles
for select to authenticated
using (id = auth.uid() or public.shares_business_with(id));

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Global business templates
create policy business_templates_read on public.business_templates
for select to authenticated using (is_active = true);

create policy business_template_fields_read on public.business_template_fields
for select to authenticated using (true);

-- Businesses
create policy businesses_read_member on public.businesses
for select to authenticated
using (public.is_business_member(id));

create policy businesses_update_owner on public.businesses
for update to authenticated
using (public.is_business_owner(id))
with check (public.is_business_owner(id));

-- Members
create policy members_read_team on public.business_members
for select to authenticated
using (public.is_business_member(business_id));

create policy members_owner_insert on public.business_members
for insert to authenticated
with check (public.is_business_owner(business_id));

create policy members_owner_update on public.business_members
for update to authenticated
using (public.is_business_owner(business_id))
with check (public.is_business_owner(business_id));

create policy members_owner_delete on public.business_members
for delete to authenticated
using (public.is_business_owner(business_id) and role <> 'owner');

-- Invitations
create policy invitations_owner_read on public.business_invitations
for select to authenticated using (public.is_business_owner(business_id));
create policy invitations_owner_insert on public.business_invitations
for insert to authenticated with check (public.is_business_owner(business_id));
create policy invitations_owner_update on public.business_invitations
for update to authenticated using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy invitations_owner_delete on public.business_invitations
for delete to authenticated using (public.is_business_owner(business_id));

-- Customers
create policy customers_read_member on public.customers
for select to authenticated using (public.is_business_member(business_id));
create policy customers_insert_ops on public.customers
for insert to authenticated with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]));
create policy customers_update_ops on public.customers
for update to authenticated using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]));
create policy customers_delete_admin on public.customers
for delete to authenticated using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]));

-- Catalog
create policy catalog_read_member on public.catalog_items
for select to authenticated using (public.is_business_member(business_id));
create policy catalog_insert_ops on public.catalog_items
for insert to authenticated with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]));
create policy catalog_update_ops on public.catalog_items
for update to authenticated using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]));
create policy catalog_delete_admin on public.catalog_items
for delete to authenticated using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]));

-- Orders
create policy orders_read_member on public.orders
for select to authenticated using (public.is_business_member(business_id));
create policy orders_update_ops on public.orders
for update to authenticated using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]));
create policy orders_delete_admin on public.orders
for delete to authenticated using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]));
-- Insert goes through create_order RPC.

create policy order_items_read_member on public.order_items
for select to authenticated using (public.is_business_member(business_id));
create policy order_items_insert_ops on public.order_items
for insert to authenticated with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]));
create policy order_items_update_ops on public.order_items
for update to authenticated using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]));
create policy order_items_delete_ops on public.order_items
for delete to authenticated using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]));

-- Custom fields
create policy cfd_read_member on public.custom_field_definitions
for select to authenticated using (public.is_business_member(business_id));
create policy cfd_manage_admin on public.custom_field_definitions
for all to authenticated
using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]));

create policy cfo_read_member on public.custom_field_options
for select to authenticated using (public.is_business_member(business_id));
create policy cfo_manage_admin on public.custom_field_options
for all to authenticated
using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]));

create policy cfv_read_member on public.custom_field_values
for select to authenticated using (public.is_business_member(business_id));
create policy cfv_manage_ops on public.custom_field_values
for all to authenticated
using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]));

-- Payment methods
create policy payment_methods_read_member on public.payment_methods
for select to authenticated using (public.is_business_member(business_id));
create policy payment_methods_manage on public.payment_methods
for all to authenticated
using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role]));

-- Invoices/payments: direct mutations blocked; use RPCs.
create policy invoices_read_member on public.invoices
for select to authenticated using (public.is_business_member(business_id));
create policy invoice_items_read_member on public.invoice_items
for select to authenticated using (public.is_business_member(business_id));
create policy payments_read_member on public.payments
for select to authenticated using (public.is_business_member(business_id));

create policy invoice_links_read_member on public.invoice_public_links
for select to authenticated using (public.is_business_member(business_id));
create policy invoice_links_manage_ops on public.invoice_public_links
for all to authenticated
using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role,'finance'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role,'finance'::public.member_role]));

-- Messaging
create policy message_templates_read_member on public.message_templates
for select to authenticated using (public.is_business_member(business_id));
create policy message_templates_manage_admin on public.message_templates
for all to authenticated
using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]));

create policy message_deliveries_read_member on public.message_deliveries
for select to authenticated using (public.is_business_member(business_id));
create policy message_deliveries_insert_member on public.message_deliveries
for insert to authenticated with check (public.is_business_member(business_id));
create policy message_deliveries_update_admin on public.message_deliveries
for update to authenticated using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]))
with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]));

-- Files metadata
create policy files_read_member on public.files
for select to authenticated using (public.is_business_member(business_id));
create policy files_insert_member on public.files
for insert to authenticated with check (public.is_business_member(business_id));
create policy files_update_own_or_admin on public.files
for update to authenticated
using (uploaded_by = auth.uid() or public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]))
with check (public.is_business_member(business_id));
create policy files_delete_own_or_admin on public.files
for delete to authenticated
using (uploaded_by = auth.uid() or public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]));

-- Audit
create policy activity_logs_read_admin on public.activity_logs
for select to authenticated
using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role]));

-- Settings (non-secret only)
create policy business_settings_read_member on public.business_settings
for select to authenticated using (public.is_business_member(business_id));
create policy business_settings_manage_owner on public.business_settings
for all to authenticated
using (public.is_business_owner(business_id))
with check (public.is_business_owner(business_id));

-- document_counters intentionally has no client policy.

-- ============================================================
-- STORAGE BUCKETS + POLICIES
-- Paths MUST start with business_id: <business_uuid>/...
-- ============================================================

insert into storage.buckets(id, name, public)
values
  ('pesanlunas-files','pesanlunas-files',false),
  ('pesanlunas-invoices','pesanlunas-invoices',false),
  ('pesanlunas-payment-proofs','pesanlunas-payment-proofs',false)
on conflict (id) do update set public = false;

create policy "pesanlunas storage member read"
on storage.objects for select to authenticated
using (
  bucket_id in ('pesanlunas-files','pesanlunas-invoices','pesanlunas-payment-proofs')
  and exists (
    select 1 from public.business_members bm
    where bm.user_id = auth.uid()
      and bm.status = 'active'
      and bm.business_id::text = (storage.foldername(name))[1]
  )
);

create policy "pesanlunas storage member upload"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('pesanlunas-files','pesanlunas-invoices','pesanlunas-payment-proofs')
  and exists (
    select 1 from public.business_members bm
    where bm.user_id = auth.uid()
      and bm.status = 'active'
      and bm.business_id::text = (storage.foldername(name))[1]
  )
);

create policy "pesanlunas storage own-or-admin update"
on storage.objects for update to authenticated
using (
  bucket_id in ('pesanlunas-files','pesanlunas-invoices','pesanlunas-payment-proofs')
  and exists (
    select 1 from public.business_members bm
    where bm.user_id = auth.uid()
      and bm.status = 'active'
      and bm.business_id::text = (storage.foldername(name))[1]
      and bm.role in ('owner','admin')
  )
)
with check (
  bucket_id in ('pesanlunas-files','pesanlunas-invoices','pesanlunas-payment-proofs')
  and exists (
    select 1 from public.business_members bm
    where bm.user_id = auth.uid()
      and bm.status = 'active'
      and bm.business_id::text = (storage.foldername(name))[1]
      and bm.role in ('owner','admin')
  )
);

create policy "pesanlunas storage admin delete"
on storage.objects for delete to authenticated
using (
  bucket_id in ('pesanlunas-files','pesanlunas-invoices','pesanlunas-payment-proofs')
  and exists (
    select 1 from public.business_members bm
    where bm.user_id = auth.uid()
      and bm.status = 'active'
      and bm.business_id::text = (storage.foldername(name))[1]
      and bm.role in ('owner','admin')
  )
);

-- ============================================================
-- GRANTS / RPC ACCESS
-- RLS is necessary but table/function privileges are also explicit here.
-- ============================================================

grant usage on schema public to anon, authenticated;

-- Authenticated table access. RLS remains the final row-level gate.
grant select, update on public.profiles to authenticated;
grant select on public.business_templates, public.business_template_fields to authenticated;
grant select, update on public.businesses to authenticated;
grant select, insert, update, delete on public.business_members, public.business_invitations to authenticated;
grant select, insert, update, delete on public.customers, public.catalog_items to authenticated;
grant select, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert, update, delete on public.custom_field_definitions, public.custom_field_options, public.custom_field_values to authenticated;
grant select, insert, update, delete on public.payment_methods to authenticated;
grant select on public.invoices, public.invoice_items, public.payments, public.invoice_public_links to authenticated;
grant select, insert, update, delete on public.message_templates to authenticated;
grant select, insert, update on public.message_deliveries to authenticated;
grant select, insert, update, delete on public.files to authenticated;
grant select on public.activity_logs to authenticated;
grant select, insert, update, delete on public.business_settings to authenticated;
grant select on public.v_receivables to authenticated;

-- Derived/protected order columns must not be client-editable.
revoke update (business_id, customer_id, order_number, order_date, subtotal, discount_total,
               additional_fee_total, tax_total, grand_total, amount_paid)
  on public.orders from authenticated;
revoke update (owner_user_id) on public.businesses from authenticated;

-- invoice_public_links are created/revoked through trusted RPC/server flows, not raw client inserts.
revoke insert, update, delete on public.invoice_public_links from authenticated;

-- Security-definer functions are not left executable by PUBLIC by default.
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.next_document_number(uuid,public.document_type) from public;
revoke all on function public.recalculate_order_totals(uuid) from public;
revoke all on function public.trg_recalculate_order_totals() from public;
revoke all on function public.order_has_active_invoice(uuid) from public;
revoke all on function public.sync_invoice_payment_totals(uuid) from public;
revoke all on function public.validate_order_tenant_consistency() from public;
revoke all on function public.validate_order_item_tenant_consistency() from public;
revoke all on function public.validate_custom_field_value() from public;
revoke all on function public.prevent_locked_order_financial_change() from public;
revoke all on function public.prevent_order_item_change_with_active_invoice() from public;

-- RLS helper functions are safe for authenticated policy evaluation.
revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.has_business_role(uuid,public.member_role[]) from public;
revoke all on function public.is_business_owner(uuid) from public;
revoke all on function public.shares_business_with(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid,public.member_role[]) to authenticated;
grant execute on function public.is_business_owner(uuid) to authenticated;
grant execute on function public.shares_business_with(uuid) to authenticated;

-- User-facing RPCs.
revoke all on function public.create_business(text,text,text) from public;
revoke all on function public.create_order(uuid,jsonb) from public;
revoke all on function public.issue_invoice(uuid) from public;
revoke all on function public.record_payment(uuid,bigint,text,timestamptz,text,text,text) from public;
revoke all on function public.record_refund(uuid,bigint,text,timestamptz,text,text) from public;
revoke all on function public.void_payment(uuid,text) from public;
revoke all on function public.void_invoice(uuid,text) from public;
revoke all on function public.create_invoice_public_link(uuid,timestamptz) from public;
revoke all on function public.get_dashboard_summary(uuid,date,date) from public;
revoke all on function public.resolve_public_invoice(text) from public;

grant execute on function public.create_business(text,text,text) to authenticated;
grant execute on function public.create_order(uuid,jsonb) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.record_payment(uuid,bigint,text,timestamptz,text,text,text) to authenticated;
grant execute on function public.record_refund(uuid,bigint,text,timestamptz,text,text) to authenticated;
grant execute on function public.void_payment(uuid,text) to authenticated;
grant execute on function public.void_invoice(uuid,text) to authenticated;
grant execute on function public.create_invoice_public_link(uuid,timestamptz) to authenticated;
grant execute on function public.get_dashboard_summary(uuid,date,date) to authenticated;
grant execute on function public.resolve_public_invoice(text) to anon, authenticated;

commit;

-- ============================================================
-- POST-INSTALL CHECKLIST
-- ============================================================
-- [ ] Create one auth user through Supabase Auth.
-- [ ] Call: select public.create_business('Dapur Rina','dapur-rina','catering');
-- [ ] Add a customer from the app/client.
-- [ ] Call create_order(...) and verify order + invoice numbers.
-- [ ] Record DP/cicilan using record_payment(...).
-- [ ] Verify v_receivables shows overdue dynamically after due_date.
-- [ ] Generate a token using create_invoice_public_link(...).
-- [ ] Resolve it using resolve_public_invoice(token) as anon.
-- [ ] Confirm RLS blocks access from a user in another business.
-- [ ] Keep Fonnte/Starsender secrets only in Supabase Edge Function secrets or Vercel server env.
-- PesanLunas v0.2.0 CRUD patch
begin;

create or replace function public.create_business_invitation(
  p_business_id uuid,
  p_email text,
  p_role public.member_role default 'staff'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_hash text;
  v_id uuid;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Only the business owner may invite team members';
  end if;
  if nullif(trim(p_email),'') is null then raise exception 'Email is required'; end if;
  if p_role = 'owner' then raise exception 'Owner role cannot be invited'; end if;

  update public.business_invitations
     set revoked_at = now()
   where business_id = p_business_id
     and lower(email) = lower(trim(p_email))
     and accepted_at is null and revoked_at is null;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  insert into public.business_invitations(business_id,email,role,token_hash,expires_at,invited_by)
  values(p_business_id,lower(trim(p_email)),p_role,v_hash,now()+interval '7 days',auth.uid())
  returning id into v_id;

  insert into public.activity_logs(business_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),'team.invited','business_invitation',v_id,jsonb_build_object('email',lower(trim(p_email)),'role',p_role));

  return jsonb_build_object('invitation_id',v_id,'token',v_token,'expires_at',now()+interval '7 days');
end;
$$;

create or replace function public.accept_business_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
  v_inv public.business_invitations%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email',''));
begin
  if auth.uid() is null then raise exception 'Login is required'; end if;
  select * into v_inv from public.business_invitations
   where token_hash = v_hash and accepted_at is null and revoked_at is null and expires_at > now()
   for update;
  if not found then raise exception 'Invitation is invalid or expired'; end if;
  if v_inv.email is not null and lower(v_inv.email) <> v_email then
    raise exception 'This invitation belongs to another email address';
  end if;

  insert into public.business_members(business_id,user_id,role,status,invited_by,joined_at)
  values(v_inv.business_id,auth.uid(),v_inv.role,'active',v_inv.invited_by,now())
  on conflict (business_id,user_id) do update set role=excluded.role,status='active',joined_at=coalesce(public.business_members.joined_at,now()),updated_at=now();

  update public.business_invitations set accepted_at=now() where id=v_inv.id;
  insert into public.activity_logs(business_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(v_inv.business_id,auth.uid(),'team.joined','profile',auth.uid(),jsonb_build_object('role',v_inv.role));
  return jsonb_build_object('business_id',v_inv.business_id,'role',v_inv.role);
end;
$$;

revoke all on function public.create_business_invitation(uuid,text,public.member_role) from public;
revoke all on function public.accept_business_invitation(text) from public;
grant execute on function public.create_business_invitation(uuid,text,public.member_role) to authenticated;
grant execute on function public.accept_business_invitation(text) to authenticated;


create or replace function public.revise_order(
  p_order_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_customer_id uuid;
  v_item jsonb;
  v_cf jsonb;
  v_invoice_id uuid;
begin
  select * into v_order from public.orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.has_business_role(v_order.business_id,
    array['owner'::public.member_role,'admin'::public.member_role,'staff'::public.member_role]) then
    raise exception 'Not authorized to revise order';
  end if;
  if public.order_has_active_invoice(p_order_id) then
    raise exception 'Void the active invoice before revising this order';
  end if;

  v_customer_id := coalesce(nullif(p_payload->>'customer_id','')::uuid, v_order.customer_id);
  if not exists(select 1 from public.customers c where c.id=v_customer_id and c.business_id=v_order.business_id and c.deleted_at is null) then
    raise exception 'Customer does not belong to this business';
  end if;
  if jsonb_typeof(coalesce(p_payload->'items','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb))=0 then
    raise exception 'At least one order item is required';
  end if;

  update public.orders set
    customer_id=v_customer_id,
    status=coalesce(nullif(p_payload->>'status','')::public.order_status,status),
    order_date=coalesce(nullif(p_payload->>'order_date','')::date,order_date),
    expected_date=nullif(p_payload->>'expected_date','')::date,
    due_date=nullif(p_payload->>'due_date','')::date,
    discount_total=greatest(coalesce((p_payload->>'discount_total')::bigint,0),0),
    additional_fee_total=greatest(coalesce((p_payload->>'additional_fee_total')::bigint,0),0),
    tax_total=greatest(coalesce((p_payload->>'tax_total')::bigint,0),0),
    customer_notes=p_payload->>'customer_notes',
    internal_notes=p_payload->>'internal_notes',
    amount_paid=0,
    updated_at=now()
  where id=p_order_id;

  delete from public.order_items where order_id=p_order_id;
  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    if nullif(trim(v_item->>'name'),'') is null then raise exception 'Every item requires a name'; end if;
    insert into public.order_items(
      business_id,order_id,catalog_item_id,name,description,qty,unit,unit_price,line_discount,sort_order
    ) values(
      v_order.business_id,p_order_id,nullif(v_item->>'catalog_item_id','')::uuid,trim(v_item->>'name'),
      v_item->>'description',coalesce((v_item->>'qty')::numeric,1),coalesce(nullif(v_item->>'unit',''),'pcs'),
      greatest(coalesce((v_item->>'unit_price')::bigint,0),0),greatest(coalesce((v_item->>'line_discount')::bigint,0),0),
      coalesce((v_item->>'sort_order')::integer,0)
    );
  end loop;

  delete from public.custom_field_values where entity_type='order' and entity_id=p_order_id;
  for v_cf in select value from jsonb_array_elements(coalesce(p_payload->'custom_fields','[]'::jsonb)) loop
    insert into public.custom_field_values(business_id,definition_id,entity_type,entity_id,value_json,created_by)
    values(v_order.business_id,(v_cf->>'definition_id')::uuid,'order',p_order_id,coalesce(v_cf->'value','null'::jsonb),auth.uid());
  end loop;

  if exists(
    select 1 from public.custom_field_definitions d
    where d.business_id=v_order.business_id and d.entity_type='order' and d.is_active=true and d.is_required=true
      and not exists(select 1 from public.custom_field_values cv where cv.definition_id=d.id and cv.entity_id=p_order_id
        and cv.value_json is not null and cv.value_json<>'null'::jsonb and cv.value_json<>'""'::jsonb)
  ) then raise exception 'One or more required custom fields are missing'; end if;

  perform public.recalculate_order_totals(p_order_id);
  v_invoice_id := public.issue_invoice(p_order_id);

  insert into public.activity_logs(business_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(v_order.business_id,auth.uid(),'order.revised','order',p_order_id,jsonb_build_object('invoice_id',v_invoice_id));

  return jsonb_build_object('order_id',p_order_id,'invoice_id',v_invoice_id);
end;
$$;

revoke all on function public.revise_order(uuid,jsonb) from public;
grant execute on function public.revise_order(uuid,jsonb) to authenticated;

commit;

-- ============================================================
-- v0.2.1 PERFORMANCE + UI DATA EXTENSION
-- ============================================================
-- PesanLunas v0.2.1 - Performance + UI data patch
-- Run ONCE on an existing v0.2.0 database.
-- Single-install/client edition. No SaaS/Super Admin tables are added.

begin;

-- Hot path indexes for the single-install app.
create index if not exists business_members_user_active_created_idx
  on public.business_members(user_id, created_at)
  where status = 'active';

create index if not exists orders_business_created_desc_idx
  on public.orders(business_id, created_at desc)
  where deleted_at is null;

create index if not exists orders_business_status_created_desc_idx
  on public.orders(business_id, status, created_at desc)
  where deleted_at is null;

create index if not exists invoices_business_payment_due_idx
  on public.invoices(business_id, payment_status, due_date)
  where deleted_at is null;

-- Resolve the one active business for the current installation/user.
create or replace function public.get_single_business_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'slug', b.slug,
    'logo_url', b.logo_url,
    'timezone', coalesce(nullif(b.timezone,''), 'Asia/Jakarta'),
    'whatsapp', b.whatsapp,
    'role', bm.role::text
  )
  into v_result
  from public.business_members bm
  join public.businesses b on b.id = bm.business_id
  where bm.user_id = auth.uid()
    and bm.status = 'active'
    and b.deleted_at is null
  order by bm.created_at asc
  limit 1;

  return v_result;
end;
$$;

-- One round-trip payload for Dashboard.
create or replace function public.get_single_dashboard_payload(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business_name text;
  v_business_slug text;
  v_logo_url text;
  v_timezone text;
  v_whatsapp text;
  v_role text;
  v_today date;
  v_from date;
  v_to date;
  v_invoice_total numeric := 0;
  v_invoice_paid numeric := 0;
  v_summary jsonb;
  v_recent jsonb := '[]'::jsonb;
  v_chart jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select b.id, b.name, b.slug, b.logo_url, coalesce(nullif(b.timezone,''),'Asia/Jakarta'), b.whatsapp, bm.role::text
  into v_business_id, v_business_name, v_business_slug, v_logo_url, v_timezone, v_whatsapp, v_role
  from public.business_members bm
  join public.businesses b on b.id = bm.business_id
  where bm.user_id = auth.uid() and bm.status='active' and b.deleted_at is null
  order by bm.created_at asc
  limit 1;

  if v_business_id is null then
    return jsonb_build_object('business', null);
  end if;

  v_today := (now() at time zone v_timezone)::date;
  v_from := coalesce(p_from, date_trunc('month', v_today)::date);
  v_to := coalesce(p_to, (date_trunc('month', v_today) + interval '1 month - 1 day')::date);

  select
    coalesce(sum(i.grand_total),0),
    coalesce(sum(least(i.amount_paid, i.grand_total)),0)
  into v_invoice_total, v_invoice_paid
  from public.invoices i
  where i.business_id = v_business_id
    and i.deleted_at is null
    and i.payment_status not in ('void','refunded')
    and i.issue_date between v_from and v_to;

  select jsonb_build_object(
    'order_today', (select count(*) from public.orders o where o.business_id=v_business_id and o.deleted_at is null and o.order_date=v_today),
    'order_need_process', (select count(*) from public.orders o where o.business_id=v_business_id and o.deleted_at is null and o.status in ('confirmed','in_progress','ready')),
    'order_value_period', (select coalesce(sum(o.grand_total),0) from public.orders o where o.business_id=v_business_id and o.deleted_at is null and o.order_date between v_from and v_to and o.status <> 'cancelled'),
    'cash_received_period', (select coalesce(sum(case when p.kind='payment' then p.amount else -p.amount end),0) from public.payments p where p.business_id=v_business_id and p.status='posted' and p.paid_at::date between v_from and v_to),
    'active_receivables', (select coalesce(sum(i.balance_due),0) from public.invoices i where i.business_id=v_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial')),
    'due_today', (select count(*) from public.invoices i where i.business_id=v_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial') and i.due_date=v_today),
    'overdue', (select count(*) from public.invoices i where i.business_id=v_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial') and i.due_date < v_today),
    'invoice_total_period', v_invoice_total,
    'invoice_paid_period', v_invoice_paid,
    'collection_rate', case when v_invoice_total > 0 then round((v_invoice_paid * 100.0 / v_invoice_total)::numeric,1) else 0 end,
    'range', jsonb_build_object('from',v_from,'to',v_to)
  ) into v_summary;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_recent
  from (
    select o.id, o.order_number, o.order_date, o.grand_total, o.balance_due, o.status, o.created_at,
           c.name as customer_name
    from public.orders o
    left join public.customers c on c.id=o.customer_id
    where o.business_id=v_business_id and o.deleted_at is null
    order by o.created_at desc
    limit 5
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('day',extract(day from x.order_date)::int,'value',x.value) order by x.order_date), '[]'::jsonb)
  into v_chart
  from (
    select o.order_date, coalesce(sum(o.grand_total),0) as value
    from public.orders o
    where o.business_id=v_business_id and o.deleted_at is null and o.status <> 'cancelled'
      and o.order_date between v_from and v_to
    group by o.order_date
    order by o.order_date
  ) x;

  return jsonb_build_object(
    'business', jsonb_build_object('id',v_business_id,'name',v_business_name,'slug',v_business_slug,'logo_url',v_logo_url,'timezone',v_timezone,'whatsapp',v_whatsapp,'role',v_role),
    'summary', v_summary,
    'recent', v_recent,
    'chart', v_chart
  );
end;
$$;

-- One round-trip payload for Orders list + counters + server-side search.
create or replace function public.get_single_orders_page(
  p_status text default 'all',
  p_query text default null,
  p_limit integer default 80
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_limit integer := greatest(10, least(coalesce(p_limit,80),200));
  v_query text := nullif(trim(coalesce(p_query,'')), '');
  v_rows jsonb := '[]'::jsonb;
  v_stats jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select bm.business_id into v_business_id
  from public.business_members bm
  join public.businesses b on b.id=bm.business_id and b.deleted_at is null
  where bm.user_id=auth.uid() and bm.status='active'
  order by bm.created_at asc limit 1;

  if v_business_id is null then return jsonb_build_object('business_id',null,'rows','[]'::jsonb,'stats','{}'::jsonb); end if;

  select jsonb_build_object(
    'total', count(*),
    'confirmed', count(*) filter (where o.status='confirmed'),
    'in_progress', count(*) filter (where o.status='in_progress'),
    'ready', count(*) filter (where o.status='ready'),
    'completed', count(*) filter (where o.status='completed'),
    'open_balance', coalesce(sum(o.balance_due) filter (where o.balance_due > 0),0)
  ) into v_stats
  from public.orders o
  where o.business_id=v_business_id and o.deleted_at is null;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select o.id, o.order_number, o.order_date, o.status, o.grand_total, o.balance_due, o.created_at,
           c.name as customer_name, c.whatsapp as customer_whatsapp
    from public.orders o
    left join public.customers c on c.id=o.customer_id
    where o.business_id=v_business_id
      and o.deleted_at is null
      and (coalesce(p_status,'all')='all' or o.status::text=p_status)
      and (v_query is null or o.order_number ilike '%'||v_query||'%' or coalesce(c.name,'') ilike '%'||v_query||'%')
    order by o.created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object('business_id',v_business_id,'stats',v_stats,'rows',v_rows);
end;
$$;

-- One round-trip payload for Receivables dashboard + list.
create or replace function public.get_single_receivables_page(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_timezone text;
  v_today date;
  v_limit integer := greatest(10, least(coalesce(p_limit,100),200));
  v_total numeric := 0;
  v_overdue numeric := 0;
  v_all_total numeric := 0;
  v_all_paid numeric := 0;
  v_metrics jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select b.id, coalesce(nullif(b.timezone,''),'Asia/Jakarta')
  into v_business_id, v_timezone
  from public.business_members bm
  join public.businesses b on b.id=bm.business_id
  where bm.user_id=auth.uid() and bm.status='active' and b.deleted_at is null
  order by bm.created_at asc limit 1;

  if v_business_id is null then return jsonb_build_object('business_id',null,'metrics','{}'::jsonb,'rows','[]'::jsonb); end if;
  v_today := (now() at time zone v_timezone)::date;

  select coalesce(sum(i.balance_due),0),
         coalesce(sum(i.balance_due) filter (where i.due_date is not null and i.due_date < v_today),0)
  into v_total, v_overdue
  from public.invoices i
  where i.business_id=v_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial');

  select coalesce(sum(i.grand_total),0), coalesce(sum(least(i.amount_paid,i.grand_total)),0)
  into v_all_total, v_all_paid
  from public.invoices i
  where i.business_id=v_business_id and i.deleted_at is null and i.payment_status not in ('void','refunded');

  select jsonb_build_object(
    'total_balance', v_total,
    'active_count', count(*),
    'unpaid_count', count(*) filter (where i.payment_status='unpaid'),
    'partial_count', count(*) filter (where i.payment_status='partial'),
    'overdue_count', count(*) filter (where i.due_date is not null and i.due_date < v_today),
    'overdue_balance', v_overdue,
    'due_today_count', count(*) filter (where i.due_date=v_today),
    'due_7d_count', count(*) filter (where i.due_date > v_today and i.due_date <= v_today+7),
    'due_7d_balance', coalesce(sum(i.balance_due) filter (where i.due_date > v_today and i.due_date <= v_today+7),0),
    'amount_paid_on_open', coalesce(sum(i.amount_paid),0),
    'risk_pct', case when v_total>0 then round((v_overdue*100.0/v_total)::numeric,1) else 0 end,
    'collection_rate', case when v_all_total>0 then round((v_all_paid*100.0/v_all_total)::numeric,1) else 0 end,
    'aging_1_7', coalesce(sum(i.balance_due) filter (where i.due_date is not null and (v_today-i.due_date) between 1 and 7),0),
    'aging_8_30', coalesce(sum(i.balance_due) filter (where i.due_date is not null and (v_today-i.due_date) between 8 and 30),0),
    'aging_31_plus', coalesce(sum(i.balance_due) filter (where i.due_date is not null and (v_today-i.due_date) > 30),0)
  ) into v_metrics
  from public.invoices i
  where i.business_id=v_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.due_sort asc, x.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select i.id as invoice_id, i.invoice_number, i.grand_total, i.amount_paid, i.balance_due,
           i.issue_date, i.due_date, i.payment_status::text as payment_status, i.created_at,
           coalesce(i.due_date, '9999-12-31'::date) as due_sort,
           case when i.due_date is not null and i.due_date < v_today then 'overdue' else i.payment_status::text end as effective_payment_status,
           case when i.due_date is null then null else v_today-i.due_date end as days_from_due,
           c.name as customer_name, c.whatsapp as customer_whatsapp
    from public.invoices i
    join public.customers c on c.id=i.customer_id
    where i.business_id=v_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial')
    order by coalesce(i.due_date, '9999-12-31'::date), i.created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object('business_id',v_business_id,'today',v_today,'metrics',v_metrics,'rows',v_rows);
end;
$$;

revoke all on function public.get_single_business_context() from public;
revoke all on function public.get_single_dashboard_payload(date,date) from public;
revoke all on function public.get_single_orders_page(text,text,integer) from public;
revoke all on function public.get_single_receivables_page(integer) from public;

grant execute on function public.get_single_business_context() to authenticated;
grant execute on function public.get_single_dashboard_payload(date,date) to authenticated;
grant execute on function public.get_single_orders_page(text,text,integer) to authenticated;
grant execute on function public.get_single_receivables_page(integer) to authenticated;

commit;
-- ============================================================
-- PesanLunas v0.2.3 — Automatic Catalog SKU
-- Upgrade patch for an existing v0.2.2 / v0.2.1 / v0.2.0 database.
-- Run ONCE in Supabase SQL Editor.
-- ============================================================

begin;

alter table public.businesses
  add column if not exists sku_prefix text not null default 'SKU';

-- Keep the setting compact and predictable. The trigger normalizes it to uppercase.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_sku_prefix_length_chk'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_sku_prefix_length_chk
      check (char_length(trim(sku_prefix)) between 1 and 12);
  end if;
end $$;

-- Internal counter per business + prefix. This lets a new prefix start at 000001,
-- while returning to an old prefix continues its previous sequence.
create table if not exists public.catalog_sku_counters (
  business_id uuid not null references public.businesses(id) on delete cascade,
  prefix text not null,
  current_value bigint not null default 0 check (current_value >= 0),
  updated_at timestamptz not null default now(),
  primary key (business_id, prefix)
);

alter table public.catalog_sku_counters enable row level security;
-- No client policies are intentionally created. The table is internal and is only
-- touched through the SECURITY DEFINER trigger below.

create or replace function public.assign_catalog_sku()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_num bigint;
  v_candidate text;
begin
  -- SKU is immutable once created. A legacy row with NULL SKU is allowed
  -- to pass through once so it can be backfilled automatically.
  if tg_op = 'UPDATE' and old.sku is not null then
    new.sku := old.sku;
    return new;
  end if;

  select upper(regexp_replace(coalesce(nullif(trim(b.sku_prefix), ''), 'SKU'), '[^A-Za-z0-9_-]', '', 'g'))
    into v_prefix
  from public.businesses b
  where b.id = new.business_id
    and b.deleted_at is null;

  if v_prefix is null or v_prefix = '' then
    v_prefix := 'SKU';
  end if;

  -- Always generate on insert, even if a client accidentally sends a manual SKU.
  loop
    insert into public.catalog_sku_counters(business_id, prefix, current_value)
    values (new.business_id, v_prefix, 1)
    on conflict (business_id, prefix)
    do update set current_value = public.catalog_sku_counters.current_value + 1,
                  updated_at = now()
    returning current_value into v_num;

    v_candidate := format('%s-%s', v_prefix, lpad(v_num::text, 6, '0'));

    exit when not exists (
      select 1
      from public.catalog_items ci
      where ci.business_id = new.business_id
        and ci.deleted_at is null
        and lower(ci.sku) = lower(v_candidate)
    );
  end loop;

  new.sku := v_candidate;
  return new;
end;
$$;

drop trigger if exists trg_assign_catalog_sku on public.catalog_items;
create trigger trg_assign_catalog_sku
  before insert or update of sku on public.catalog_items
  for each row execute function public.assign_catalog_sku();

-- Existing rows that still have no SKU receive an automatic code as well.
-- Because old.sku is NULL, the trigger generates the value instead of freezing it.
update public.catalog_items
set sku = null
where sku is null and deleted_at is null;

-- Extend the fast single-install business context so the catalog screen receives
-- the SKU prefix without an extra browser query.
create or replace function public.get_single_business_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'slug', b.slug,
    'logo_url', b.logo_url,
    'timezone', coalesce(nullif(b.timezone,''), 'Asia/Jakarta'),
    'whatsapp', b.whatsapp,
    'sku_prefix', coalesce(nullif(b.sku_prefix,''), 'SKU'),
    'role', bm.role::text
  )
  into v_result
  from public.business_members bm
  join public.businesses b on b.id = bm.business_id
  where bm.user_id = auth.uid()
    and bm.status = 'active'
    and b.deleted_at is null
  order by bm.created_at asc
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.get_single_business_context() from public;
grant execute on function public.get_single_business_context() to authenticated;

commit;

-- ============================================================
-- v1.4 ADD-ON — Personalized Dashboard + Dynamic Motivation
-- ============================================================
-- PesanLunas v0.2.8 — Dashboard Personalization Patch
-- Safe for an existing v0.2.x database. Run once in Supabase SQL Editor.
-- No table/column changes. Only upgrades the optimized dashboard RPC.

begin;

create or replace function public.get_single_dashboard_payload(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business_name text;
  v_business_slug text;
  v_logo_url text;
  v_timezone text;
  v_whatsapp text;
  v_role text;
  v_viewer_name text;
  v_motivation jsonb;
  v_today date;
  v_from date;
  v_to date;
  v_invoice_total numeric := 0;
  v_invoice_paid numeric := 0;
  v_summary jsonb;
  v_recent jsonb := '[]'::jsonb;
  v_chart jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select
    b.id,
    b.name,
    b.slug,
    b.logo_url,
    coalesce(nullif(b.timezone,''),'Asia/Jakarta'),
    b.whatsapp,
    bm.role::text
  into
    v_business_id,
    v_business_name,
    v_business_slug,
    v_logo_url,
    v_timezone,
    v_whatsapp,
    v_role
  from public.business_members bm
  join public.businesses b on b.id = bm.business_id
  where bm.user_id = auth.uid()
    and bm.status='active'
    and b.deleted_at is null
  order by bm.created_at asc
  limit 1;

  if v_business_id is null then
    return jsonb_build_object('business', null);
  end if;

  select nullif(trim(p.full_name),'')
  into v_viewer_name
  from public.profiles p
  where p.id = auth.uid();

  select bs.value
  into v_motivation
  from public.business_settings bs
  where bs.business_id = v_business_id
    and bs.key = 'dashboard_motivation'
  limit 1;

  v_today := (now() at time zone v_timezone)::date;
  v_from := coalesce(p_from, date_trunc('month', v_today)::date);
  v_to := coalesce(p_to, (date_trunc('month', v_today) + interval '1 month - 1 day')::date);

  select
    coalesce(sum(i.grand_total),0),
    coalesce(sum(least(i.amount_paid, i.grand_total)),0)
  into v_invoice_total, v_invoice_paid
  from public.invoices i
  where i.business_id = v_business_id
    and i.deleted_at is null
    and i.payment_status not in ('void','refunded')
    and i.issue_date between v_from and v_to;

  select jsonb_build_object(
    'order_today', (select count(*) from public.orders o where o.business_id=v_business_id and o.deleted_at is null and o.order_date=v_today),
    'order_need_process', (select count(*) from public.orders o where o.business_id=v_business_id and o.deleted_at is null and o.status in ('confirmed','in_progress','ready')),
    'order_value_period', (select coalesce(sum(o.grand_total),0) from public.orders o where o.business_id=v_business_id and o.deleted_at is null and o.order_date between v_from and v_to and o.status <> 'cancelled'),
    'cash_received_period', (select coalesce(sum(case when p.kind='payment' then p.amount else -p.amount end),0) from public.payments p where p.business_id=v_business_id and p.status='posted' and p.paid_at::date between v_from and v_to),
    'active_receivables', (select coalesce(sum(i.balance_due),0) from public.invoices i where i.business_id=v_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial')),
    'due_today', (select count(*) from public.invoices i where i.business_id=v_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial') and i.due_date=v_today),
    'overdue', (select count(*) from public.invoices i where i.business_id=v_business_id and i.deleted_at is null and i.payment_status in ('unpaid','partial') and i.due_date < v_today),
    'invoice_total_period', v_invoice_total,
    'invoice_paid_period', v_invoice_paid,
    'collection_rate', case when v_invoice_total > 0 then round((v_invoice_paid * 100.0 / v_invoice_total)::numeric,1) else 0 end,
    'range', jsonb_build_object('from',v_from,'to',v_to)
  ) into v_summary;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_recent
  from (
    select
      o.id,
      o.order_number,
      o.order_date,
      o.grand_total,
      o.balance_due,
      o.status,
      o.created_at,
      c.name as customer_name
    from public.orders o
    left join public.customers c on c.id=o.customer_id
    where o.business_id=v_business_id
      and o.deleted_at is null
    order by o.created_at desc
    limit 5
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', extract(day from x.order_date)::int,
        'value', x.value
      )
      order by x.order_date
    ),
    '[]'::jsonb
  )
  into v_chart
  from (
    select o.order_date, coalesce(sum(o.grand_total),0) as value
    from public.orders o
    where o.business_id=v_business_id
      and o.deleted_at is null
      and o.status <> 'cancelled'
      and o.order_date between v_from and v_to
    group by o.order_date
    order by o.order_date
  ) x;

  return jsonb_build_object(
    'business', jsonb_build_object(
      'id',v_business_id,
      'name',v_business_name,
      'slug',v_business_slug,
      'logo_url',v_logo_url,
      'timezone',v_timezone,
      'whatsapp',v_whatsapp,
      'role',v_role
    ),
    'viewer_name', coalesce(v_viewer_name, v_business_name),
    'motivation', v_motivation,
    'summary', v_summary,
    'recent', v_recent,
    'chart', v_chart
  );
end;
$$;

revoke all on function public.get_single_dashboard_payload(date,date) from public;
grant execute on function public.get_single_dashboard_payload(date,date) to authenticated;

commit;

-- ============================================================
-- PesanLunas v0.2.9 - Single auth / invitation preview
-- ============================================================

create or replace function public.get_business_invitation_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
  v_inv public.business_invitations%rowtype;
  v_business_name text;
begin
  select * into v_inv
  from public.business_invitations
  where token_hash = v_hash
    and accepted_at is null
    and revoked_at is null
    and expires_at > now();

  if not found then raise exception 'Invitation is invalid or expired'; end if;

  select b.name into v_business_name
  from public.businesses b
  where b.id = v_inv.business_id and b.deleted_at is null and b.is_active = true;

  if v_business_name is null then raise exception 'Business is not active'; end if;

  return jsonb_build_object(
    'email', lower(coalesce(v_inv.email,'')),
    'role', v_inv.role::text,
    'business_name', v_business_name,
    'expires_at', v_inv.expires_at
  );
end;
$$;

revoke all on function public.get_business_invitation_preview(text) from public;
grant execute on function public.get_business_invitation_preview(text) to anon, authenticated;
