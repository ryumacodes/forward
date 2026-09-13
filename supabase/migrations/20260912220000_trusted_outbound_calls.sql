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
