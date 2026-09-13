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