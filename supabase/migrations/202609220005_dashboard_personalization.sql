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
