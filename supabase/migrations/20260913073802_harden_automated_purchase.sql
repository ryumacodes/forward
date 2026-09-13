drop index if exists public.suppliers_organization_website_unique;
alter table public.suppliers add constraint suppliers_organization_website_key
  unique (organization_id,website_url);

-- A queue item may have multiple technical call attempts. The queue's call_id
-- points at the current attempt; webhook updates additionally match that id.
alter table public.supplier_calls drop constraint if exists supplier_calls_queue_item_id_key;
create index supplier_calls_queue_item_idx on public.supplier_calls(queue_item_id)
  where queue_item_id is not null;

-- Requests and their immutable purchasing policies are created together. An
-- ordinary member cannot retrofit auto-purchase onto an existing request.
revoke insert on public.procurement_requests from authenticated;
revoke insert,update,delete on public.negotiation_policies from authenticated;

create or replace function public.create_procurement_request_with_policy(p_organization_id uuid,p_details jsonb)
returns table(id uuid,status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  budget_cents bigint;
  payment_days integer;
  deposit_bps integer;
  automatic boolean;
  actor_role text;
begin
  select role into actor_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = (select auth.uid());
  if actor_role is null then raise exception 'Organization membership is required'; end if;

  budget_cents := round(((p_details->>'budget')::numeric) * 100);
  payment_days := coalesce((p_details->>'minimumPaymentDays')::integer,14);
  deposit_bps := round(coalesce((p_details->>'maximumDepositPercent')::numeric,0) * 100);
  automatic := coalesce(p_details->>'purchaseMode','confirm') = 'preauthorized';
  if automatic and actor_role not in ('owner','admin') then
    raise exception 'Only an owner or administrator can pre-authorize purchasing';
  end if;
  if budget_cents <= 0 or payment_days not between 0 and 365 or deposit_bps not between 0 and 10000 then
    raise exception 'Invalid negotiation policy';
  end if;

  insert into public.procurement_requests(organization_id,details)
  values (p_organization_id,p_details)
  returning procurement_requests.id into new_id;

  insert into public.negotiation_policies(
    organization_id,request_id,maximum_total_cents,minimum_payment_days,
    maximum_deposit_bps,maximum_counteroffers,allow_substitutions,
    allow_anonymous_market_anchor,auto_purchase,preauthorized_by,
    preauthorized_at,authorization_snapshot
  ) values (
    p_organization_id,new_id,budget_cents,payment_days,deposit_bps,2,false,false,
    automatic,case when automatic then (select auth.uid()) end,
    case when automatic then now() end,
    case when automatic then jsonb_build_object(
      'requestId',new_id,
      'maximumTotalCents',budget_cents,
      'minimumPaymentDays',payment_days,
      'maximumDepositBps',deposit_bps,
      'allowSubstitutions',false,
      'item',p_details->'item',
      'quantity',p_details->'quantity',
      'unit',p_details->'unit',
      'deadline',p_details->'deadline',
      'requiresHalal',p_details->'requiresHalal',
      'cut',p_details->'cut',
      'freshness',p_details->'freshness'
    ) end
  );
  return query select new_id,'Ready to source'::text;
end;
$$;

revoke all on function public.create_procurement_request_with_policy(uuid,jsonb) from public,anon;
grant execute on function public.create_procurement_request_with_policy(uuid,jsonb) to authenticated;

create or replace function public.claim_purchase_order(
  p_organization_id uuid,
  p_quote_id uuid,
  p_order_id uuid,
  p_po_number text,
  p_terms jsonb,
  p_approved_by uuid,
  p_authorization_mode text
)
returns table(id uuid,po_number text,status text,provider_email_id text,created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_quote public.supplier_quotes%rowtype;
  selected_request public.procurement_requests%rowtype;
  selected_policy public.negotiation_policies%rowtype;
  selected_supplier public.suppliers%rowtype;
  selected_verification public.supplier_verifications%rowtype;
  existing_order public.purchase_orders%rowtype;
  selected_request_id uuid;
  request_details jsonb;
  quote_details jsonb;
begin
  if p_authorization_mode not in ('explicit','preauthorized') then raise exception 'Invalid authorization mode'; end if;

  select q.request_id into selected_request_id from public.supplier_quotes q
  where q.id = p_quote_id and q.organization_id = p_organization_id;
  if not found then raise exception 'Quote was not found'; end if;

  select r.* into selected_request from public.procurement_requests r
  where r.id = selected_request_id and r.organization_id = p_organization_id
  for update;
  if not found then raise exception 'Request was not found'; end if;

  select q.* into selected_quote from public.supplier_quotes q
  where q.id = p_quote_id and q.organization_id = p_organization_id
  for update;

  select po.* into existing_order from public.purchase_orders po
  where po.request_id = selected_request.id and po.status <> 'cancelled';
  if found then
    if existing_order.quote_id <> p_quote_id then raise exception 'This request already has a purchase order'; end if;
    return query select existing_order.id,existing_order.po_number,existing_order.status,existing_order.provider_email_id,false;
    return;
  end if;

  select policy.* into selected_policy from public.negotiation_policies policy
  where policy.request_id = selected_request.id and policy.organization_id = p_organization_id;
  if not found then raise exception 'Negotiation policy was not found'; end if;
  select supplier.* into selected_supplier from public.suppliers supplier
  where supplier.id = selected_quote.supplier_id and supplier.organization_id = p_organization_id;
  if not found then raise exception 'Supplier was not found'; end if;
  select verification.* into selected_verification from public.supplier_verifications verification
  where verification.supplier_id = selected_quote.supplier_id and verification.organization_id = p_organization_id;
  if not found then raise exception 'Supplier verification was not found'; end if;

  request_details := selected_request.details;
  quote_details := selected_quote.details;
  if selected_request.status = 'Approved' then raise exception 'Request is already approved'; end if;
  if not selected_supplier.authorised or selected_supplier.do_not_contact or selected_supplier.email is null then raise exception 'Supplier is not eligible for purchasing'; end if;
  if not selected_verification.active or not selected_verification.name_matched or not selected_verification.contact_confirmed or selected_verification.checked_at < now() - interval '24 hours' or selected_verification.checked_at > now() then raise exception 'Fresh verified supplier evidence is required'; end if;
  if selected_quote.needs_review or not selected_quote.terms_confirmed then raise exception 'Quote terms require review'; end if;
  if selected_quote.total_cents > selected_policy.maximum_total_cents then raise exception 'Quote exceeds the authorized maximum'; end if;
  if selected_quote.quantity < (request_details->>'quantity')::numeric then raise exception 'Quote quantity is insufficient'; end if;
  if selected_quote.payment_days < selected_policy.minimum_payment_days then raise exception 'Payment terms are below the authorized minimum'; end if;
  if selected_quote.deposit_bps > selected_policy.maximum_deposit_bps then raise exception 'Deposit exceeds the authorized maximum'; end if;
  if quote_details->'available' is distinct from 'true'::jsonb or quote_details->'specificationConfirmed' is distinct from 'true'::jsonb then raise exception 'Availability and exact specification must be confirmed'; end if;
  if coalesce((quote_details->>'isSubstitution')::boolean,false) and not selected_policy.allow_substitutions then raise exception 'Substitution is not authorized'; end if;
  if nullif(quote_details->>'deliveryTime','') is null or nullif(request_details->>'deadline','') is null or (quote_details->>'deliveryTime')::timestamptz > (request_details->>'deadline')::timestamptz then raise exception 'Delivery misses or lacks the deadline'; end if;
  if coalesce((request_details->>'requiresHalal')::boolean,false) and not exists (
    select 1 from jsonb_array_elements_text(coalesce(quote_details->'certifications','[]'::jsonb)) certification
    where certification ~* 'halal'
  ) then raise exception 'Required halal certification is missing'; end if;
  if p_authorization_mode = 'explicit' and not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = p_approved_by and role in ('owner','admin')
  ) then raise exception 'Owner or administrator approval is required'; end if;
  if p_authorization_mode = 'preauthorized' and (
    not selected_policy.auto_purchase
    or selected_policy.preauthorized_by is null
    or selected_policy.preauthorized_by <> p_approved_by
    or selected_policy.authorization_snapshot is null
  ) then raise exception 'Stored pre-authorization is invalid'; end if;

  insert into public.purchase_orders(
    id,organization_id,request_id,supplier_id,quote_id,po_number,total_cents,
    terms,approved_by,authorization_mode
  ) values (
    p_order_id,p_organization_id,selected_request.id,selected_quote.supplier_id,
    selected_quote.id,p_po_number,selected_quote.total_cents,p_terms,p_approved_by,
    p_authorization_mode
  ) returning purchase_orders.* into existing_order;
  return query select existing_order.id,existing_order.po_number,existing_order.status,existing_order.provider_email_id,true;
end;
$$;

revoke all on function public.claim_purchase_order(uuid,uuid,uuid,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_purchase_order(uuid,uuid,uuid,text,jsonb,uuid,text) to service_role;

do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array['suppliers','supplier_verifications','purchase_orders','agent_decisions'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I',target_table);
      end if;
    end loop;
  end if;
end;
$$;
