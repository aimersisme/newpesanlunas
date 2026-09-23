-- PesanLunas v0.2.11 — Hutang & Piutang
create table if not exists public.debt_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('receivable','payable')),
  person_name text not null,
  whatsapp text,
  email text,
  reference text,
  original_amount bigint not null check (original_amount > 0),
  balance_amount bigint not null check (balance_amount >= 0),
  transaction_date date not null default current_date,
  due_date date,
  notes text,
  status text not null default 'open' check (status in ('open','partial','paid','cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debt_records(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount bigint not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists debt_records_business_type_idx on public.debt_records(business_id,type,transaction_date desc) where deleted_at is null;
create index if not exists debt_records_business_due_idx on public.debt_records(business_id,due_date) where deleted_at is null;
create index if not exists debt_records_business_person_idx on public.debt_records(business_id,lower(person_name)) where deleted_at is null;
create index if not exists debt_payments_debt_date_idx on public.debt_payments(debt_id,payment_date desc);
create index if not exists debt_payments_business_date_idx on public.debt_payments(business_id,payment_date desc);

drop trigger if exists trg_debt_records_updated_at on public.debt_records;
create trigger trg_debt_records_updated_at before update on public.debt_records for each row execute function public.set_updated_at();

alter table public.debt_records enable row level security;
alter table public.debt_payments enable row level security;

drop policy if exists debt_records_read_member on public.debt_records;
create policy debt_records_read_member on public.debt_records for select to authenticated using (public.is_business_member(business_id));
drop policy if exists debt_records_insert_finance on public.debt_records;
create policy debt_records_insert_finance on public.debt_records for insert to authenticated with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role]));
drop policy if exists debt_records_update_finance on public.debt_records;
create policy debt_records_update_finance on public.debt_records for update to authenticated using (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role])) with check (public.has_business_role(business_id, array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role]));

drop policy if exists debt_payments_read_member on public.debt_payments;
create policy debt_payments_read_member on public.debt_payments for select to authenticated using (public.is_business_member(business_id));

drop function if exists public.record_debt_payment(uuid,bigint,date,text);
create or replace function public.record_debt_payment(p_debt_id uuid, p_amount bigint, p_payment_date date default current_date, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt public.debt_records%rowtype;
  v_new_balance bigint;
  v_status text;
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  select * into v_debt from public.debt_records where id=p_debt_id and deleted_at is null for update;
  if not found then raise exception 'Debt record not found'; end if;
  if not public.has_business_role(v_debt.business_id, array['owner'::public.member_role,'admin'::public.member_role,'finance'::public.member_role]) then raise exception 'Not authorized to record debt payments'; end if;
  if p_amount > v_debt.balance_amount then raise exception 'Payment exceeds remaining balance'; end if;
  v_new_balance := v_debt.balance_amount - p_amount;
  v_status := case when v_new_balance = 0 then 'paid' when v_new_balance < v_debt.original_amount then 'partial' else 'open' end;
  insert into public.debt_payments(debt_id,business_id,amount,payment_date,note,created_by)
  values(v_debt.id,v_debt.business_id,p_amount,coalesce(p_payment_date,current_date),nullif(trim(p_note),''),auth.uid()) returning id into v_id;
  update public.debt_records set balance_amount=v_new_balance,status=v_status,updated_at=now() where id=v_debt.id;
  return jsonb_build_object('payment_id',v_id,'balance_amount',v_new_balance,'status',v_status);
end;
$$;

grant execute on function public.record_debt_payment(uuid,bigint,date,text) to authenticated;
