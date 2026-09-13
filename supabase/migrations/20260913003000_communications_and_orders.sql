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
