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
