-- SourcePilot reset
-- Drops every object the migrations create so you can re-run
-- supabase/sql-editor-bootstrap.sql from scratch on the same project.
--
-- Safe to run twice: every statement is idempotent (IF EXISTS).
-- This does NOT touch the auth.* schema or any Supabase roles.
-- If you also use `supabase db push`, clear the CLI migration history
-- afterwards:
--   delete from supabase_migrations.schema_migrations
--   where version like '2609%';

drop table if exists public.procurement_requests cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.supplier_verifications cascade;
drop table if exists public.supplier_quotes cascade;
drop table if exists public.supplier_calls cascade;
drop table if exists public.supplier_call_queue cascade;
drop table if exists public.communication_events cascade;
drop table if exists public.purchase_orders cascade;
drop table if exists public.discovery_profiles cascade;
drop table if exists public.negotiation_policies cascade;
drop table if exists public.intake_results cascade;
drop table if exists public.agent_decisions cascade;
drop table if exists public.supplier_evidence cascade;
drop table if exists public.organizations cascade;
drop table if exists public.organization_members cascade;
drop table if exists public.profiles cascade;

drop function if exists public.create_procurement_request_with_policy(uuid,jsonb);
drop function if exists public.claim_next_supplier_call(uuid,uuid,uuid,integer);
drop function if exists public.claim_purchase_order(uuid,uuid,uuid,text,jsonb,uuid,text);
drop function if exists public.create_organization(text);
drop function if exists public.add_organization_member(uuid,text,text);
drop function if exists public.create_recovery_with_policy(jsonb);

drop schema if exists private cascade;