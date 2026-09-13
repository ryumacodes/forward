alter table public.communication_events drop constraint communication_events_channel_check;
alter table public.communication_events add constraint communication_events_channel_check
  check (channel in ('email','sms','voice'));

alter table public.communication_events drop constraint communication_events_purpose_check;
alter table public.communication_events add constraint communication_events_purpose_check
  check (purpose in ('supplier_brief','owner_approval','purchase_order','owner_completion'));

comment on table public.communication_events is 'Idempotent audit trail for supplier messages, approval requests, purchase orders, and final owner completion notifications.';
