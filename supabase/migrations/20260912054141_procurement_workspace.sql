-- One business owner per workspace for the initial product. Team membership is not implied.
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

-- Only trusted backend jobs can write registry evidence, quotes and call records.
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
