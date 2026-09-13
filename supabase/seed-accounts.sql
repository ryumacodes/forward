-- SourcePilot demo accounts
-- Creates (or wires up) two login accounts and puts them in a business
-- organisation named "SourcePilot".
--
-- Run this whole file in Supabase Dashboard -> SQL Editor (runs as the
-- postgres role, bypasses RLS).
--
-- WARNING: both accounts use the plaintext password "password". Intended for
-- a hackathon/demo project only, never for a public production deployment.
--
-- Assumes the migrations that introduce organisations, profiles and
-- multi-member workspaces have been applied (26091302 through 26091307);
-- otherwise run supabase/sql-editor-bootstrap.sql first.

do $$
declare
  v_hash   text := '$2a$10$ayaZP7OYR6kVNoz/RhmCE.yBkrcfQyHZlwCiZJxvKWATQbi3yPID2';
  v_cindy  uuid;
  v_sharon uuid;
  v_org    uuid;
begin
  -- 1. Create the two accounts if they don't already exist.
  --    NOTE: the "token" columns (confirmation_token, recovery_token,
  --    email_change*, phone_change*) MUST stay non-NULL empty strings.
  --    GoTrue's User struct maps them to plain Go strings; pop v6 cannot
  --    scan a NULL into a string, which surfaces as a login 500
  --    ("error finding user: ... converting NULL to string is unsupported").
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    confirmation_token,recovery_token,email_change_token_new,
    email_change,email_change_token_current,phone_change,phone_change_token,
    reauthentication_token,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  )
  select
    '00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
    'cindy.thienthaolai@gmail.com',v_hash,now(),
    '','','','','','','','',
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('full_name','Cindy'),now(),now()
  where not exists (select 1 from auth.users u where lower(u.email) = 'cindy.thienthaolai@gmail.com');

  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    confirmation_token,recovery_token,email_change_token_new,
    email_change,email_change_token_current,phone_change,phone_change_token,
    reauthentication_token,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  )
  select
    '00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
    'sharonshaun2301@gmail.com',v_hash,now(),
    '','','','','','','','',
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('full_name','Sharon'),now(),now()
  where not exists (select 1 from auth.users u where lower(u.email) = 'sharonshaun2301@gmail.com');

  -- Repair accounts created before the fix (for example by seeding scripts
  -- that omitted the token columns): normalize NULL token columns to ''.
  update auth.users set
    confirmation_token   = coalesce(confirmation_token, ''),
    recovery_token       = coalesce(recovery_token, ''),
    email_change_token_new    = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    email_change         = coalesce(email_change, ''),
    phone_change_token   = coalesce(phone_change_token, ''),
    phone_change         = coalesce(phone_change, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
  where confirmation_token is null or recovery_token is null
     or email_change is null or email_change_token_new is null
     or email_change_token_current is null or phone_change_token is null
     or phone_change is null or reauthentication_token is null;

  select id into v_cindy  from auth.users where lower(email) = 'cindy.thienthaolai@gmail.com';
  select id into v_sharon from auth.users where lower(email) = 'sharonshaun2301@gmail.com';
  if v_cindy is null or v_sharon is null then
    raise exception 'Account creation failed; check the auth.users insert columns match this project';
  end if;

  -- 2. Link OAuth-style identity rows so sign-ins and the user endpoint work.
  insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
  select gen_random_uuid(),v_cindy,v_cindy::text,
    jsonb_build_object('sub',v_cindy::text,'email','cindy.thienthaolai@gmail.com','email_verified',true,'phone_verified',false),
    'email',now(),now(),now()
  where not exists (select 1 from auth.identities i where i.user_id = v_cindy and i.provider = 'email');

  insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
  select gen_random_uuid(),v_sharon,v_sharon::text,
    jsonb_build_object('sub',v_sharon::text,'email','sharonshaun2301@gmail.com','email_verified',true,'phone_verified',false),
    'email',now(),now(),now()
  where not exists (select 1 from auth.identities i where i.user_id = v_sharon and i.provider = 'email');

  -- 3. Personal workspaces, memberships and profiles (normally created by
  --    the auth.users triggers; kept idempotent as a fallback).
  insert into public.organizations(id,name,kind,personal_owner_id,created_by)
  values (v_cindy,'Cindy''s workspace','personal',v_cindy,v_cindy)
  on conflict (id) do nothing;
  insert into public.organization_members(organization_id,user_id,role)
  values (v_cindy,v_cindy,'owner')
  on conflict (organization_id,user_id) do nothing;
  insert into public.profiles(id,full_name,email)
  values (v_cindy,'Cindy','cindy.thienthaolai@gmail.com')
  on conflict (id) do nothing;

  insert into public.organizations(id,name,kind,personal_owner_id,created_by)
  values (v_sharon,'Sharon''s workspace','personal',v_sharon,v_sharon)
  on conflict (id) do nothing;
  insert into public.organization_members(organization_id,user_id,role)
  values (v_sharon,v_sharon,'owner')
  on conflict (organization_id,user_id) do nothing;
  insert into public.profiles(id,full_name,email)
  values (v_sharon,'Sharon','sharonshaun2301@gmail.com')
  on conflict (id) do nothing;

  -- 4. The shared "SourcePilot" business organisation (created if missing),
  --    with both accounts as administrators so either can manage the team.
  select id into v_org from public.organizations
  where lower(trim(name)) = 'sourcepilot'
  order by created_at limit 1;

  if v_org is null then
    insert into public.organizations(id,name,kind,created_by)
    values (gen_random_uuid(),'SourcePilot','business',v_cindy)
    returning id into v_org;
  end if;

  insert into public.organization_members(organization_id,user_id,role)
  values (v_org,v_cindy,'admin'),(v_org,v_sharon,'admin')
  on conflict (organization_id,user_id) do update set role = excluded.role;

  raise notice 'SourcePilot org % ready; Cindy=% Sharon=%', v_org, v_cindy, v_sharon;
end;
$$;