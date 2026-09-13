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
