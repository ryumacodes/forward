alter table public.supplier_imports
  add column authorised boolean not null default false,
  add column authorised_at timestamptz;

alter table public.supplier_imports
  add constraint supplier_authorisation_timestamp check ((authorised and authorised_at is not null) or (not authorised and authorised_at is null));

create index supplier_imports_owner_authorised_idx on public.supplier_imports(owner_id, authorised);
