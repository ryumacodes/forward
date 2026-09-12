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

-- A backend worker writes model output and the source evidence together. The model's
-- output is never treated as permission to contact or purchase.
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
