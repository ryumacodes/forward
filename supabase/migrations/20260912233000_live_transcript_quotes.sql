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
