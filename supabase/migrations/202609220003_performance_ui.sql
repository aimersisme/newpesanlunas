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
