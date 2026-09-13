-- Discovery results can be imported as incomplete leads. They remain ineligible
-- for contact until a valid ABN and phone are supplied, verified, and authorised.
alter table public.suppliers alter column abn drop not null;
alter table public.suppliers alter column phone drop not null;
alter table public.suppliers add column website_url text;
alter table public.suppliers add column discovery_evidence_id uuid references public.supplier_evidence(id) on delete set null;
alter table public.suppliers add constraint suppliers_lead_contact_check
  check (abn is not null or phone is not null or email is not null or website_url is not null);
create unique index suppliers_organization_website_unique
  on public.suppliers(organization_id,website_url)
  where website_url is not null;
create index suppliers_discovery_evidence_idx on public.suppliers(discovery_evidence_id)
  where discovery_evidence_id is not null;

alter table public.negotiation_policies
  add column preauthorized_by uuid references auth.users(id),
  add column preauthorized_at timestamptz,
  add column authorization_snapshot jsonb;
alter table public.negotiation_policies add constraint negotiation_policies_preauthorization_check
  check (
    not auto_purchase or (
      preauthorized_by is not null
      and preauthorized_at is not null
      and jsonb_typeof(authorization_snapshot) = 'object'
    )
  );

alter table public.purchase_orders
  add column authorization_mode text not null default 'explicit'
  check (authorization_mode in ('explicit','preauthorized'));
create unique index purchase_orders_one_open_per_request
  on public.purchase_orders(request_id)
  where status <> 'cancelled';

create or replace function public.create_procurement_request_with_policy(p_organization_id uuid,p_details jsonb)
returns table(id uuid,status text)
language plpgsql
security invoker
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

-- Atomically reserves the one purchase order allowed for a request. The Edge
-- function performs the full deterministic revalidation immediately beforehand;
-- this transaction repeats the critical price/authorization checks under lock.
create function public.claim_purchase_order(
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
  existing_order public.purchase_orders%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Service role is required'; end if;
  if p_authorization_mode not in ('explicit','preauthorized') then raise exception 'Invalid authorization mode'; end if;

  select * into selected_quote from public.supplier_quotes
  where id = p_quote_id and organization_id = p_organization_id;
  if not found then raise exception 'Quote was not found'; end if;

  select * into selected_request from public.procurement_requests
  where id = selected_quote.request_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'Request was not found'; end if;

  select * into existing_order from public.purchase_orders
  where request_id = selected_request.id and status <> 'cancelled';
  if found then
    if existing_order.quote_id <> p_quote_id then raise exception 'This request already has a purchase order'; end if;
    return query select existing_order.id,existing_order.po_number,existing_order.status,existing_order.provider_email_id,false;
    return;
  end if;

  select * into selected_policy from public.negotiation_policies
  where request_id = selected_request.id and organization_id = p_organization_id;
  if not found then raise exception 'Negotiation policy was not found'; end if;
  if selected_quote.needs_review or not selected_quote.terms_confirmed then raise exception 'Quote terms require review'; end if;
  if selected_quote.total_cents > selected_policy.maximum_total_cents then raise exception 'Quote exceeds the authorized maximum'; end if;
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

comment on table public.purchase_orders is 'Purchase orders reserved atomically after deterministic validation, using explicit approval or a stored request-scoped pre-authorization.';
