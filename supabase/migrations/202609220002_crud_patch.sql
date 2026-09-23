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
