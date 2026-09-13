-- SourcePilot complete Supabase schema
-- Paste this entire file into Supabase SQL Editor and click Run.
-- WARNING: only run against a database that does not already have these
-- migrations applied (e.g. a fresh preview branch); re-running on an
-- existing database will fail on already-created objects.

begin;

-- Migration: 26091201_procurement_workspace.sql
create table public.recovery_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  status text not null default 'Ready to source' check (status in ('Ready to source','Calling suppliers','Needs approval','Approved')),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index recovery_requests_owner_created_idx on public.recovery_requests(owner_id, created_at desc);

create table public.supplier_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  abn text not null check (abn ~ '^[1-9][0-9]{10}$'),
  phone text not null check (length(phone) between 8 and 22),
  created_at timestamptz not null default now(),
  unique (owner_id, abn),
  unique (id, owner_id)
);

create table public.supplier_verifications (
  supplier_id uuid primary key,
  owner_id uuid not null,
  active boolean not null,
  legal_name text not null,
  gst_registered boolean,
  name_matched boolean not null default false,
  contact_confirmed boolean not null default false,
  source text not null default 'ABR' check (source = 'ABR'),
  checked_at timestamptz not null default now(),
  foreign key (supplier_id, owner_id) references public.supplier_imports(id, owner_id) on delete cascade
);
create index supplier_verifications_owner_idx on public.supplier_verifications(owner_id);

create table public.supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  request_id uuid not null,
  supplier_id uuid not null,
  total_cents bigint not null check (total_cents >= 0),
  quantity numeric(15,3) not null check (quantity > 0),
  payment_days integer not null check (payment_days between 0 and 365),
  deposit_bps integer not null check (deposit_bps between 0 and 10000),
  terms_confirmed boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (request_id, owner_id) references public.recovery_requests(id, owner_id) on delete cascade,
  foreign key (supplier_id, owner_id) references public.supplier_imports(id, owner_id) on delete cascade
);
create index supplier_quotes_owner_request_idx on public.supplier_quotes(owner_id, request_id);
create index supplier_quotes_supplier_idx on public.supplier_quotes(supplier_id, owner_id);

create table public.supplier_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  request_id uuid not null,
  supplier_id uuid not null,
  provider_conversation_id text unique,
  transcript text,
  cues jsonb not null default '{}'::jsonb,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (request_id, owner_id) references public.recovery_requests(id, owner_id) on delete cascade,
  foreign key (supplier_id, owner_id) references public.supplier_imports(id, owner_id) on delete cascade
);
create index supplier_calls_owner_request_idx on public.supplier_calls(owner_id, request_id);
create index supplier_calls_supplier_idx on public.supplier_calls(supplier_id, owner_id);

alter table public.recovery_requests enable row level security;
alter table public.supplier_imports enable row level security;
alter table public.supplier_verifications enable row level security;
alter table public.supplier_quotes enable row level security;
alter table public.supplier_calls enable row level security;

revoke all on public.recovery_requests, public.supplier_imports, public.supplier_verifications, public.supplier_quotes, public.supplier_calls from anon, authenticated;
grant select on public.recovery_requests, public.supplier_imports, public.supplier_verifications, public.supplier_quotes, public.supplier_calls to authenticated;
grant insert (id, owner_id, details) on public.recovery_requests to authenticated;
grant update (status) on public.recovery_requests to authenticated;
grant insert (id, owner_id, name, abn, phone) on public.supplier_imports to authenticated;
grant all on public.recovery_requests, public.supplier_imports, public.supplier_verifications, public.supplier_quotes, public.supplier_calls to service_role;

create policy owner_reads_requests on public.recovery_requests for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_creates_requests on public.recovery_requests for insert to authenticated with check ((select auth.uid()) = owner_id and status = 'Ready to source');
create policy owner_records_approval on public.recovery_requests for update to authenticated using ((select auth.uid()) = owner_id and status = 'Needs approval') with check ((select auth.uid()) = owner_id and status = 'Approved');
create policy owner_reads_suppliers on public.supplier_imports for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_imports_suppliers on public.supplier_imports for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy owner_reads_verifications on public.supplier_verifications for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_reads_quotes on public.supplier_quotes for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_reads_calls on public.supplier_calls for select to authenticated using ((select auth.uid()) = owner_id);

-- Migration: 26091202_procurement_policy_and_discovery.sql
create table public.discovery_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  business_type text not null check (length(trim(business_type)) between 1 and 80),
  weights jsonb not null check (jsonb_typeof(weights) = 'object'),
  hard_rules jsonb not null check (jsonb_typeof(hard_rules) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.negotiation_policies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  maximum_total_cents bigint not null check (maximum_total_cents >= 0),
  minimum_payment_days integer not null check (minimum_payment_days between 0 and 365),
  maximum_deposit_bps integer not null check (maximum_deposit_bps between 0 and 10000),
  maximum_counteroffers integer not null default 2 check (maximum_counteroffers between 0 and 5),
  allow_substitutions boolean not null default false,
  allow_anonymous_market_anchor boolean not null default false,
  auto_purchase boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (request_id, owner_id) references public.recovery_requests(id, owner_id) on delete cascade,
  unique (request_id)
);

create table public.intake_results (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid,
  source_type text not null check (source_type in ('voice_call','voice_note','email','sms','form')),
  model text not null,
  normalized jsonb not null check (jsonb_typeof(normalized) = 'object'),
  source_hash text not null,
  needs_review boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (request_id, owner_id) references public.recovery_requests(id, owner_id) on delete cascade
);

create table public.agent_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid,
  supplier_id uuid,
  decision_type text not null check (decision_type in ('discovery','contact','negotiation','purchase')),
  outcome text not null check (outcome in ('allow','block','counter','escalate','stop')),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (request_id, owner_id) references public.recovery_requests(id, owner_id) on delete cascade,
  foreign key (supplier_id, owner_id) references public.supplier_imports(id, owner_id) on delete cascade
);

create index discovery_profiles_owner_idx on public.discovery_profiles(owner_id);
create index negotiation_policies_owner_idx on public.negotiation_policies(owner_id);
create index intake_results_owner_created_idx on public.intake_results(owner_id, created_at desc);
create index agent_decisions_owner_created_idx on public.agent_decisions(owner_id, created_at desc);

alter table public.discovery_profiles enable row level security;
alter table public.negotiation_policies enable row level security;
alter table public.intake_results enable row level security;
alter table public.agent_decisions enable row level security;

revoke all on public.discovery_profiles, public.negotiation_policies, public.intake_results, public.agent_decisions from anon, authenticated;
grant select, insert, update, delete on public.discovery_profiles, public.negotiation_policies to authenticated;
grant select on public.intake_results, public.agent_decisions to authenticated;
grant all on public.discovery_profiles, public.negotiation_policies, public.intake_results, public.agent_decisions to service_role;

create policy owner_manages_discovery_profiles on public.discovery_profiles for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy owner_manages_negotiation_policies on public.negotiation_policies for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy owner_reads_intake_results on public.intake_results for select to authenticated using ((select auth.uid()) = owner_id);
create policy owner_reads_agent_decisions on public.agent_decisions for select to authenticated using ((select auth.uid()) = owner_id);

-- Migration: 26091203_live_abr_authorisation.sql
alter table public.supplier_imports
  add column authorised boolean not null default false,
  add column authorised_at timestamptz;

alter table public.supplier_imports
  add constraint supplier_authorisation_timestamp check ((authorised and authorised_at is not null) or (not authorised and authorised_at is null));

create index supplier_imports_owner_authorised_idx on public.supplier_imports(owner_id, authorised);

-- Migration: 26091204_supplier_evidence.sql
create table public.supplier_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  search_query text not null check (length(trim(search_query)) between 3 and 500),
  supplier_name text not null check (length(trim(supplier_name)) between 1 and 200),
  website_url text not null check (website_url like 'https://%'),
  source_url text not null check (source_url like 'https://%'),
  source_title text not null default '',
  content_excerpt text not null check (length(content_excerpt) <= 20000),
  extracted_facts jsonb not null check (jsonb_typeof(extracted_facts) = 'object'),
  embedding_model text not null,
  embedding real[] not null check (cardinality(embedding) = 1536),
  source_hash text not null,
  checked_at timestamptz not null default now(),
  unique (owner_id, source_hash)
);

create index supplier_evidence_owner_checked_idx on public.supplier_evidence(owner_id, checked_at desc);
alter table public.supplier_evidence enable row level security;
revoke all on public.supplier_evidence from anon, authenticated;
grant select on public.supplier_evidence to authenticated;
grant all on public.supplier_evidence to service_role;
create policy owner_reads_supplier_evidence on public.supplier_evidence for select to authenticated using ((select auth.uid()) = owner_id);

comment on table public.supplier_evidence is 'Public web evidence and embeddings used for candidate recall; never an ABR verification or outreach authorisation.';

-- Migration: 26091205_trusted_outbound_calls.sql
alter table public.supplier_imports
  add column contact_source text not null default 'the business owner’s supplier record' check (length(contact_source) between 3 and 200),
  add column time_zone text not null default 'Australia/Melbourne' check (length(time_zone) between 3 and 80),
  add column do_not_contact boolean not null default false;

alter table public.supplier_calls
  add column status text not null default 'queued' check (status in ('queued','initiated','completed','failed','stopped')),
  add column provider text not null default 'elevenlabs_sip' check (provider = 'elevenlabs_sip'),
  add column first_message text,
  add column callback_number text,
  add column policy_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(policy_snapshot) = 'object'),
  add column provider_error text,
  add column completed_at timestamptz;

create index supplier_calls_attempt_window_idx on public.supplier_calls(owner_id,supplier_id,created_at desc);

comment on column public.supplier_imports.do_not_contact is 'Fail-closed opt-out applied before every channel; only trusted server workflows may clear it.';
comment on column public.supplier_calls.policy_snapshot is 'Immutable-at-dispatch evidence of the contact and negotiation limits passed to the voice agent.';

create function public.create_recovery_with_policy(p_details jsonb)
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
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  budget_cents := round(((p_details->>'budget')::numeric) * 100);
  payment_days := coalesce((p_details->>'minimumPaymentDays')::integer,14);
  deposit_bps := round(coalesce((p_details->>'maximumDepositPercent')::numeric,0) * 100);
  if budget_cents <= 0 or payment_days not between 0 and 365 or deposit_bps not between 0 and 10000 then raise exception 'Invalid negotiation policy'; end if;
  insert into public.recovery_requests(owner_id,details) values ((select auth.uid()),p_details) returning recovery_requests.id into new_id;
  insert into public.negotiation_policies(owner_id,request_id,maximum_total_cents,minimum_payment_days,maximum_deposit_bps,maximum_counteroffers,allow_substitutions,allow_anonymous_market_anchor,auto_purchase)
    values ((select auth.uid()),new_id,budget_cents,payment_days,deposit_bps,2,false,false,false);
  return query select new_id,'Ready to source'::text;
end;
$$;

revoke all on function public.create_recovery_with_policy(jsonb) from public,anon;
grant execute on function public.create_recovery_with_policy(jsonb) to authenticated;

-- Migration: 26091206_live_transcript_quotes.sql
alter table public.supplier_calls
  add column transcript_json jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript_json) = 'array'),
  add column provider_analysis jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_analysis) = 'object');

alter table public.supplier_quotes
  add column call_id uuid references public.supplier_calls(id) on delete cascade,
  add column extraction_model text,
  add column extraction_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(extraction_evidence) = 'array'),
  add column needs_review boolean not null default true;

alter table public.supplier_quotes add constraint supplier_quotes_call_id_key unique(call_id);
comment on column public.supplier_quotes.needs_review is 'True when required quote facts are absent or model-extracted totals do not reconcile.';

-- Migration: 26091301_communications_and_orders.sql
alter table public.supplier_imports add column email text check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
grant insert(email) on public.supplier_imports to authenticated;
alter table public.supplier_quotes add constraint supplier_quotes_id_owner_key unique(id,owner_id);
revoke update(status) on public.recovery_requests from authenticated;

create table public.communication_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  supplier_id uuid,
  quote_id uuid,
  channel text not null check (channel in ('email','sms')),
  purpose text not null check (purpose in ('supplier_brief','owner_approval','purchase_order')),
  recipient text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','uncertain')),
  provider_id text,
  provider_error text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (request_id,owner_id) references public.recovery_requests(id,owner_id) on delete cascade,
  foreign key (supplier_id,owner_id) references public.supplier_imports(id,owner_id) on delete cascade,
  foreign key (quote_id,owner_id) references public.supplier_quotes(id,owner_id) on delete cascade,
  unique (owner_id,idempotency_key)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  supplier_id uuid not null,
  quote_id uuid not null,
  po_number text not null unique,
  total_cents bigint not null check (total_cents >= 0),
  status text not null default 'draft' check (status in ('draft','sent','cancelled')),
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  provider_email_id text,
  created_at timestamptz not null default now(),
  foreign key (request_id,owner_id) references public.recovery_requests(id,owner_id),
  foreign key (supplier_id,owner_id) references public.supplier_imports(id,owner_id),
  foreign key (quote_id,owner_id) references public.supplier_quotes(id,owner_id),
  unique (quote_id)
);

create index communication_events_owner_idx on public.communication_events(owner_id,created_at desc);
create index purchase_orders_owner_idx on public.purchase_orders(owner_id,created_at desc);
alter table public.communication_events enable row level security;
alter table public.purchase_orders enable row level security;
revoke all on public.communication_events,public.purchase_orders from anon,authenticated;
grant select on public.communication_events,public.purchase_orders to authenticated;
grant all on public.communication_events,public.purchase_orders to service_role;
create policy owner_reads_communications on public.communication_events for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_reads_purchase_orders on public.purchase_orders for select to authenticated using ((select auth.uid())=owner_id);
comment on table public.purchase_orders is 'Purchase orders created only by an authenticated owner action after deterministic quote and supplier revalidation.';

-- Migration: 26091302_organization_workspaces.sql
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

-- Migration: 26091303_supplier_call_queue.sql
create table public.supplier_call_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  supplier_id uuid not null,
  priority integer not null default 100 check (priority between 0 and 10000),
  status text not null default 'queued' check (status in ('queued','processing','calling','completed','blocked','failed','uncertain','cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  worker_id uuid,
  call_id uuid unique,
  last_error text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (request_id,organization_id) references public.procurement_requests(id,organization_id) on delete cascade,
  foreign key (supplier_id,organization_id) references public.suppliers(id,organization_id) on delete cascade,
  unique (organization_id,request_id,supplier_id)
);

create index supplier_call_queue_request_idx
  on public.supplier_call_queue(organization_id,request_id,created_at desc);
create index supplier_call_queue_supplier_idx
  on public.supplier_call_queue(supplier_id,organization_id);
create index supplier_call_queue_ready_idx
  on public.supplier_call_queue(organization_id,request_id,priority,available_at,created_at)
  where status = 'queued';
create unique index supplier_call_queue_one_active_request_idx
  on public.supplier_call_queue(request_id)
  where status in ('processing','calling');

alter table public.supplier_call_queue enable row level security;
revoke all on public.supplier_call_queue from anon,authenticated;
grant select on public.supplier_call_queue to authenticated;
grant all on public.supplier_call_queue to service_role;
create policy members_read_supplier_call_queue on public.supplier_call_queue
  for select to authenticated
  using ((select private.is_organization_member(organization_id)));

alter table public.supplier_calls
  add column queue_item_id uuid unique references public.supplier_call_queue(id) on delete set null;
alter table public.supplier_call_queue
  add constraint supplier_call_queue_call_id_fkey
  foreign key (call_id) references public.supplier_calls(id) on delete set null;

create or replace function public.claim_next_supplier_call(
  p_organization_id uuid,
  p_request_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns setof public.supplier_call_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lease_seconds not between 30 and 600 then
    raise exception 'Lease must be between 30 and 600 seconds';
  end if;

  update public.supplier_call_queue
  set status = case when attempt_count < max_attempts then 'queued' else 'failed' end,
      available_at = now(),
      claimed_at = null,
      lease_expires_at = null,
      worker_id = null,
      last_error = 'Worker lease expired before call dispatch completed',
      completed_at = case when attempt_count >= max_attempts then now() else null end,
      updated_at = now()
  where organization_id = p_organization_id
    and request_id = p_request_id
    and status = 'processing'
    and lease_expires_at < now();

  update public.supplier_call_queue
  set status = 'uncertain',
      worker_id = null,
      last_error = 'The provider did not deliver a completion webhook before the call timeout',
      completed_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and request_id = p_request_id
    and status = 'calling'
    and lease_expires_at < now();

  if exists (
    select 1 from public.supplier_call_queue
    where organization_id = p_organization_id
      and request_id = p_request_id
      and status in ('processing','calling')
  ) then
    return;
  end if;

  return query
  update public.supplier_call_queue
  set status = 'processing',
      attempt_count = attempt_count + 1,
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      worker_id = p_worker_id,
      last_error = null,
      updated_at = now()
  where id = (
    select id
    from public.supplier_call_queue
    where organization_id = p_organization_id
      and request_id = p_request_id
      and status = 'queued'
      and attempt_count < max_attempts
      and available_at <= now()
    order by priority asc,created_at asc,id asc
    limit 1
    for update skip locked
  )
  returning *;
end;
$$;

revoke all on function public.claim_next_supplier_call(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_next_supplier_call(uuid,uuid,uuid,integer) to service_role;

comment on table public.supplier_call_queue is 'Durable, organisation-scoped supplier outreach queue. One call per request is active at a time.';
comment on function public.claim_next_supplier_call(uuid,uuid,uuid,integer) is 'Atomically recovers expired claims and claims the next ready supplier call using SKIP LOCKED.';

do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array['supplier_call_queue','supplier_calls','supplier_quotes','procurement_requests'] loop
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

-- Migration: 26091304_automated_sourcing_and_purchase.sql
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

-- Migration: 26091305_harden_automated_purchase.sql
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

-- Migration: 26091306_owner_completion_notifications.sql
alter table public.communication_events drop constraint communication_events_channel_check;
alter table public.communication_events add constraint communication_events_channel_check
  check (channel in ('email','sms','voice'));

alter table public.communication_events drop constraint communication_events_purpose_check;
alter table public.communication_events add constraint communication_events_purpose_check
  check (purpose in ('supplier_brief','owner_approval','purchase_order','owner_completion'));

comment on table public.communication_events is 'Idempotent audit trail for supplier messages, approval requests, purchase orders, and final owner completion notifications.';

-- Migration: 26091307_multi_member_orgs_and_request_creator.sql
-- Multi-person organisations:
--  * Every person has a profile (name, phone, email) readable by co-members so
--    the workspace can show the whole team and Sarah can reach a specific person.
--  * Every request records who started it. Sarah routes approval requests and
--    completion calls only back to that person, never to the whole organisation.
--  * An owner or administrator can add an existing account by email.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(trim(full_name)) <= 120),
  phone text,
  email text,
  updated_at timestamptz not null default now()
);

insert into public.profiles(id,full_name,email)
select
  id,
  coalesce(nullif(trim(raw_user_meta_data->>'full_name'),''),split_part(email,'@',1)),
  email
from auth.users
on conflict (id) do nothing;

create function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id,full_name,email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1)),
    new.email
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user_profile() from public,anon,authenticated;
grant execute on function private.handle_new_user_profile() to supabase_auth_admin;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function private.handle_new_user_profile();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy shared_members_read_profiles on public.profiles
for select to authenticated
using (exists (
  select 1
  from public.organization_members viewer
  join public.organization_members subject on subject.organization_id = viewer.organization_id
  where viewer.user_id = (select auth.uid())
    and subject.user_id = profiles.id
));

create policy member_updates_own_profile on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- negotiate_policies.organization_id was renamed from owner_id but its original
-- foreign key constraint to auth.users was never dropped (unlike the other
-- workspace tables), which blocked request creation for business organisations.
alter table public.negotiation_policies drop constraint if exists negotiation_policies_owner_id_fkey;

-- Track the organisation member who started each request so owner-facing
-- notifications target exactly that person.
alter table public.procurement_requests
  add column created_by uuid references auth.users(id) on delete set null;

create index procurement_requests_created_by_idx on public.procurement_requests(created_by);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'negotiation_policies'
      and column_name = 'preauthorized_by'
  ) then
    update public.procurement_requests r
    set created_by = coalesce(
      (select n.preauthorized_by from public.negotiation_policies n
       where n.request_id = r.id and n.organization_id = r.organization_id),
      (select o.personal_owner_id from public.organizations o
       where o.id = r.organization_id and o.kind = 'personal')
    )
    where r.created_by is null;
  else
    update public.procurement_requests r
    set created_by = (select o.personal_owner_id from public.organizations o
      where o.id = r.organization_id and o.kind = 'personal')
    where r.created_by is null;
  end if;
end;
$$;

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

  insert into public.procurement_requests(organization_id,details,created_by)
  values (p_organization_id,p_details,(select auth.uid()))
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

create function public.add_organization_member(p_organization_id uuid,p_email text,p_role text default 'member')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid;
  caller_role text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  select role into caller_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = (select auth.uid());
  if caller_role is null or caller_role not in ('owner','admin') then
    raise exception 'Only an owner or administrator can add members';
  end if;
  if p_role not in ('owner','admin','member') then raise exception 'Invalid role'; end if;
  if length(trim(p_email)) not between 3 and 320 or nullif(trim(p_email),'') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  select id into member_id from auth.users where lower(email) = lower(trim(p_email));
  if member_id is null then raise exception 'No SourcePilot account matches that email'; end if;
  insert into public.organization_members(organization_id,user_id,role)
  values (p_organization_id,member_id,p_role)
  on conflict (organization_id,user_id) do update set role = excluded.role;
  return member_id;
end;
$$;

revoke all on function public.add_organization_member(uuid,text,text) from public,anon;
grant execute on function public.add_organization_member(uuid,text,text) to authenticated;
commit;
