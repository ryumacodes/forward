import { test, expect } from 'bun:test'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const migrations=[
  '20260912054141_procurement_workspace.sql',
  '20260912070155_procurement_policy_and_discovery.sql',
  '20260912190000_live_abr_authorisation.sql',
  '20260912203000_supplier_evidence.sql',
  '20260912220000_trusted_outbound_calls.sql',
  '20260912233000_live_transcript_quotes.sql',
  '20260913003000_communications_and_orders.sql',
  '20260913062821_organization_workspaces.sql',
  '20260913070244_supplier_call_queue.sql',
]

test('organisation membership isolates procurement data and protected evidence',async()=>{
  const db=new PGlite()
  const userA='11111111-1111-4111-8111-111111111111',userB='22222222-2222-4222-8222-222222222222'
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
      create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role,supabase_auth_admin;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users(id,email,raw_user_meta_data) values
        ('${userA}','alex@example.com','{"full_name":"Alex Chen"}'),
        ('${userB}','sam@example.com','{"full_name":"Sam Lee"}');`)
    for(const migration of migrations)await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'))

    await db.exec(`set role authenticated; set request.jwt.claim.sub='${userA}';`)
    expect((await db.query<{name:string}>('select name from public.organizations')).rows.map(row=>row.name)).toEqual(["Alex Chen's workspace"])
    await db.query('insert into public.procurement_requests(organization_id,details) values ($1,$2)',[userA,{item:'Chicken',quantity:30,budget:350}])
    await db.query('insert into public.suppliers(organization_id,name,abn,phone) values ($1,$2,$3,$4)',[userA,'Example','51824753556','03 9000 0000'])
    expect((await db.query('select * from public.procurement_requests')).rows).toHaveLength(1)
    await expect(db.query('insert into public.procurement_requests(organization_id,details) values ($1,$2)',[userB,{}])).rejects.toThrow()
    await expect(db.query('update public.procurement_requests set organization_id=$1',[userB])).rejects.toThrow()
    await expect(db.query('insert into public.supplier_verifications(supplier_id,organization_id,active,legal_name) select id,organization_id,true,name from public.suppliers')).rejects.toThrow()
    await db.query('insert into public.discovery_profiles(organization_id,name,business_type,weights,hard_rules) values ($1,$2,$3,$4,$5)',[userA,'Hospitality','hospitality',{deliveryFit:25},{abnActive:true}])
    await expect(db.query('insert into public.intake_results(organization_id,source_type,model,normalized,source_hash) values ($1,$2,$3,$4,$5)',[userA,'email','gpt-5.6-luna',{},'hash'])).rejects.toThrow()
    await expect(db.query('insert into public.supplier_evidence(organization_id,search_query,supplier_name,website_url,source_url,content_excerpt,extracted_facts,embedding_model,embedding,source_hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[userA,'chicken Melbourne','Example','https://example.com','https://example.com','Evidence',{},'text-embedding-3-small',Array(1536).fill(0),'hash'])).rejects.toThrow()
    await expect(db.query("update public.procurement_requests set status='Approved' returning id")).rejects.toThrow()

    await db.exec(`set request.jwt.claim.sub='${userB}';`)
    expect((await db.query('select * from public.procurement_requests')).rows).toHaveLength(0)
    expect((await db.query('select * from public.suppliers')).rows).toHaveLength(0)
    expect((await db.query('select * from public.organizations')).rows).toHaveLength(1)

    await db.exec(`set request.jwt.claim.sub='${userA}';`)
    const business=await db.query<{create_organization:string}>("select public.create_organization('Flinders Kitchen')")
    const businessId=business.rows[0].create_organization
    expect((await db.query('select role from public.organization_members where organization_id=$1',[businessId])).rows).toEqual([{role:'owner'}])

    await db.exec('reset role;')
    const userC='33333333-3333-4333-8333-333333333333'
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',[userC,'taylor@example.com',{full_name:'Taylor'}])
    expect((await db.query('select kind from public.organizations where id=$1',[userC])).rows).toEqual([{kind:'personal'}])
    expect((await db.query('select role from public.organization_members where organization_id=$1 and user_id=$1',[userC])).rows).toEqual([{role:'owner'}])
    expect((await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity")).rows).toHaveLength(0)

    await db.exec("update public.procurement_requests set status='Needs approval';")
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${userA}';`)
    await expect(db.query("update public.procurement_requests set status='Approved' returning id")).rejects.toThrow()
    await db.exec('reset role;')
    const requestId=(await db.query<{id:string}>('select id from public.procurement_requests where organization_id=$1 limit 1',[userA])).rows[0].id
    const supplierId=(await db.query<{id:string}>('select id from public.suppliers where organization_id=$1 limit 1',[userA])).rows[0].id
    await db.query('insert into public.supplier_call_queue(organization_id,request_id,supplier_id,created_by) values ($1,$2,$3,$1)',[userA,requestId,supplierId])
    await db.exec('set role service_role;')
    const worker='44444444-4444-4444-8444-444444444444'
    const claimed=await db.query<{status:string;attempt_count:number}>('select status,attempt_count from public.claim_next_supplier_call($1,$2,$3,120)',[userA,requestId,worker])
    expect(claimed.rows).toEqual([{status:'processing',attempt_count:1}])
    expect((await db.query('select id from public.claim_next_supplier_call($1,$2,$3,120)',[userA,requestId,worker])).rows).toHaveLength(0)
    await db.query("update public.supplier_call_queue set status='calling',lease_expires_at=now()-interval '1 second' where request_id=$1",[requestId])
    expect((await db.query('select id from public.claim_next_supplier_call($1,$2,$3,120)',[userA,requestId,worker])).rows).toHaveLength(0)
    expect((await db.query<{status:string}>('select status from public.supplier_call_queue where request_id=$1',[requestId])).rows).toEqual([{status:'uncertain'}])
    await db.exec('reset role; set role anon;')
    await expect(db.query('select * from public.suppliers')).rejects.toThrow()
    await expect(db.query('select * from public.supplier_call_queue')).rejects.toThrow()
  }finally{await db.close()}
},30000)
