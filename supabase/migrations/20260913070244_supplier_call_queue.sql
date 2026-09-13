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
