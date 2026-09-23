-- PesanLunas v0.2.11-r2
-- Read WhatsApp provider credentials server-side without requiring
-- SUPABASE_SERVICE_ROLE_KEY in the Vercel runtime for normal sends.

begin;

create or replace function public.get_whatsapp_integration_for_member(p_business_id uuid)
returns table (provider text, api_token text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  ) then
    raise exception 'Forbidden';
  end if;

  return query
    select wi.provider, wi.api_token
    from public.whatsapp_integrations wi
    where wi.business_id = p_business_id
    limit 1;
end;
$$;

revoke all on function public.get_whatsapp_integration_for_member(uuid) from public;
grant execute on function public.get_whatsapp_integration_for_member(uuid) to authenticated;

commit;
