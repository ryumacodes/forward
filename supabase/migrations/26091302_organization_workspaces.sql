create schema if not exists private;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null default 'business' check (kind in ('personal','business')),
  personal_owner_id uuid unique references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'personal') = (personal_owner_id is not null))
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create index organization_members_user_idx on public.organization_members(user_id,organization_id);

insert into public.organizations(id,name,kind,personal_owner_id,created_by)
select
  id,
  concat(coalesce(nullif(trim(raw_user_meta_data->>'full_name'),''),nullif(split_part(email,'@',1),''),'My'),'''s workspace'),
  'personal',
  id,
  id
from auth.users
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role)
select id,id,'owner' from auth.users
on conflict (organization_id,user_id) do nothing;

create function private.handle_new_user_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_name text;
begin
  organization_name := concat(
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),nullif(split_part(new.email,'@',1),''),'My'),
    '''s workspace'
  );
  insert into public.organizations(id,name,kind,personal_owner_id,created_by)
  values (new.id,organization_name,'personal',new.id,new.id);
  insert into public.organization_members(organization_id,user_id,role)
  values (new.id,new.id,'owner');
  return new;
end;
$$;

revoke all on function private.handle_new_user_organization() from public,anon,authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.handle_new_user_organization() to supabase_auth_admin;

create trigger on_auth_user_created_create_organization
after insert on auth.users
for each row execute function private.handle_new_user_organization();

drop policy if exists owner_reads_requests on public.recovery_requests;
drop policy if exists owner_creates_requests on public.recovery_requests;
drop policy if exists owner_records_approval on public.recovery_requests;
drop policy if exists owner_reads_suppliers on public.supplier_imports;
drop policy if exists owner_imports_suppliers on public.supplier_imports;
drop policy if exists owner_reads_verifications on public.supplier_verifications;
drop policy if exists owner_reads_quotes on public.supplier_quotes;
drop policy if exists owner_reads_calls on public.supplier_calls;
drop policy if exists owner_manages_discovery_profiles on public.discovery_profiles;
drop policy if exists owner_manages_negotiation_policies on public.negotiation_policies;
drop policy if exists owner_reads_intake_results on public.intake_results;
drop policy if exists owner_reads_agent_decisions on public.agent_decisions;
drop policy if exists owner_reads_supplier_evidence on public.supplier_evidence;
drop policy if exists owner_reads_communications on public.communication_events;
drop policy if exists owner_reads_purchase_orders on public.purchase_orders;

alter table public.recovery_requests drop constraint if exists recovery_requests_owner_id_fkey;
alter table public.supplier_imports drop constraint if exists supplier_imports_owner_id_fkey;
alter table public.discovery_profiles drop constraint if exists discovery_profiles_owner_id_fkey;
alter table public.intake_results drop constraint if exists intake_results_owner_id_fkey;
alter table public.agent_decisions drop constraint if exists agent_decisions_owner_id_fkey;
alter table public.supplier_evidence drop constraint if exists supplier_evidence_owner_id_fkey;
alter table public.communication_events drop constraint if exists communication_events_owner_id_fkey;
alter table public.purchase_orders drop constraint if exists purchase_orders_owner_id_fkey;

alter table public.recovery_requests rename to procurement_requests;
alter table public.supplier_imports rename to suppliers;

alter table public.procurement_requests rename column owner_id to organization_id;
alter table public.suppliers rename column owner_id to organization_id;
alter table public.supplier_verifications rename column owner_id to organization_id;
alter table public.supplier_quotes rename column owner_id to organization_id;
alter table public.supplier_calls rename column owner_id to organization_id;
alter table public.discovery_profiles rename column owner_id to organization_id;
alter table public.negotiation_policies rename column owner_id to organization_id;
alter table public.intake_results rename column owner_id to organization_id;
alter table public.agent_decisions rename column owner_id to organization_id;
alter table public.supplier_evidence rename column owner_id to organization_id;
alter table public.communication_events rename column owner_id to organization_id;
alter table public.purchase_orders rename column owner_id to organization_id;

alter table public.procurement_requests add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.suppliers add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.supplier_verifications add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.supplier_quotes add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.supplier_calls add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.discovery_profiles add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.negotiation_policies add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.intake_results add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.agent_decisions add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.supplier_evidence add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.communication_events add foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.purchase_orders add foreign key (organization_id) references public.organizations(id) on delete cascade;

alter index if exists recovery_requests_owner_created_idx rename to procurement_requests_organization_created_idx;
alter index if exists supplier_verifications_owner_idx rename to supplier_verifications_organization_idx;
alter index if exists supplier_quotes_owner_request_idx rename to supplier_quotes_organization_request_idx;
alter index if exists supplier_calls_owner_request_idx rename to supplier_calls_organization_request_idx;
alter index if exists discovery_profiles_owner_idx rename to discovery_profiles_organization_idx;
alter index if exists negotiation_policies_owner_idx rename to negotiation_policies_organization_idx;
alter index if exists intake_results_owner_created_idx rename to intake_results_organization_created_idx;
alter index if exists agent_decisions_owner_created_idx rename to agent_decisions_organization_created_idx;
alter index if exists supplier_evidence_owner_checked_idx rename to supplier_evidence_organization_checked_idx;
alter index if exists communication_events_owner_idx rename to communication_events_organization_idx;
alter index if exists purchase_orders_owner_idx rename to purchase_orders_organization_idx;

create function private.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_organization_member(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

revoke all on public.organizations,public.organization_members from anon,authenticated;
grant select on public.organizations,public.organization_members to authenticated;
grant all on public.organizations,public.organization_members to service_role;

create policy members_read_organizations on public.organizations for select to authenticated
using ((select private.is_organization_member(id)));
create policy members_read_memberships on public.organization_members for select to authenticated
using ((select private.is_organization_member(organization_id)));

revoke all on public.procurement_requests,public.suppliers,public.supplier_verifications,public.supplier_quotes,public.supplier_calls,public.discovery_profiles,public.negotiation_policies,public.intake_results,public.agent_decisions,public.supplier_evidence,public.communication_events,public.purchase_orders from anon,authenticated;
grant select on public.procurement_requests,public.suppliers,public.supplier_verifications,public.supplier_quotes,public.supplier_calls,public.discovery_profiles,public.negotiation_policies,public.intake_results,public.agent_decisions,public.supplier_evidence,public.communication_events,public.purchase_orders to authenticated;
grant insert (id,organization_id,details) on public.procurement_requests to authenticated;
grant insert (id,organization_id,name,abn,phone,email) on public.suppliers to authenticated;
grant insert,update,delete on public.discovery_profiles,public.negotiation_policies to authenticated;
grant all on public.procurement_requests,public.suppliers,public.supplier_verifications,public.supplier_quotes,public.supplier_calls,public.discovery_profiles,public.negotiation_policies,public.intake_results,public.agent_decisions,public.supplier_evidence,public.communication_events,public.purchase_orders to service_role;

create policy members_read_procurement_requests on public.procurement_requests for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_create_procurement_requests on public.procurement_requests for insert to authenticated with check ((select private.is_organization_member(organization_id)) and status = 'Ready to source');
create policy members_read_suppliers on public.suppliers for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_import_suppliers on public.suppliers for insert to authenticated with check ((select private.is_organization_member(organization_id)));
create policy members_read_supplier_verifications on public.supplier_verifications for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_read_supplier_quotes on public.supplier_quotes for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_read_supplier_calls on public.supplier_calls for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_read_discovery_profiles on public.discovery_profiles for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_create_discovery_profiles on public.discovery_profiles for insert to authenticated with check ((select private.is_organization_member(organization_id)));
create policy members_update_discovery_profiles on public.discovery_profiles for update to authenticated using ((select private.is_organization_member(organization_id))) with check ((select private.is_organization_member(organization_id)));
create policy members_delete_discovery_profiles on public.discovery_profiles for delete to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_read_negotiation_policies on public.negotiation_policies for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_create_negotiation_policies on public.negotiation_policies for insert to authenticated with check ((select private.is_organization_member(organization_id)));
create policy members_update_negotiation_policies on public.negotiation_policies for update to authenticated using ((select private.is_organization_member(organization_id))) with check ((select private.is_organization_member(organization_id)));
create policy members_delete_negotiation_policies on public.negotiation_policies for delete to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_read_intake_results on public.intake_results for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_read_agent_decisions on public.agent_decisions for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_read_supplier_evidence on public.supplier_evidence for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_read_communications on public.communication_events for select to authenticated using ((select private.is_organization_member(organization_id)));
create policy members_read_purchase_orders on public.purchase_orders for select to authenticated using ((select private.is_organization_member(organization_id)));

drop function if exists public.create_recovery_with_policy(jsonb);

create function public.create_procurement_request_with_policy(p_organization_id uuid,p_details jsonb)
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
begin
  if not (select private.is_organization_member(p_organization_id)) then raise exception 'Organization membership is required'; end if;
  budget_cents := round(((p_details->>'budget')::numeric) * 100);
  payment_days := coalesce((p_details->>'minimumPaymentDays')::integer,14);
  deposit_bps := round(coalesce((p_details->>'maximumDepositPercent')::numeric,0) * 100);
  if budget_cents <= 0 or payment_days not between 0 and 365 or deposit_bps not between 0 and 10000 then raise exception 'Invalid negotiation policy'; end if;
  insert into public.procurement_requests(organization_id,details)
  values (p_organization_id,p_details)
  returning procurement_requests.id into new_id;
  insert into public.negotiation_policies(organization_id,request_id,maximum_total_cents,minimum_payment_days,maximum_deposit_bps,maximum_counteroffers,allow_substitutions,allow_anonymous_market_anchor,auto_purchase)
  values (p_organization_id,new_id,budget_cents,payment_days,deposit_bps,2,false,false,false);
  return query select new_id,'Ready to source'::text;
end;
$$;

revoke all on function public.create_procurement_request_with_policy(uuid,jsonb) from public,anon;
grant execute on function public.create_procurement_request_with_policy(uuid,jsonb) to authenticated;

create function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if length(trim(p_name)) not between 1 and 120 then raise exception 'Organization name must be between 1 and 120 characters'; end if;
  insert into public.organizations(name,kind,created_by)
  values (trim(p_name),'business',(select auth.uid()))
  returning id into new_id;
  insert into public.organization_members(organization_id,user_id,role)
  values (new_id,(select auth.uid()),'owner');
  return new_id;
end;
$$;

revoke all on function public.create_organization(text) from public,anon;
grant execute on function public.create_organization(text) to authenticated;
