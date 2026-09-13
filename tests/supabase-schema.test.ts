import { test, expect } from 'bun:test'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const migrations=[
  '26091201_procurement_workspace.sql',
  '26091202_procurement_policy_and_discovery.sql',
  '26091203_live_abr_authorisation.sql',
  '26091204_supplier_evidence.sql',
  '26091205_trusted_outbound_calls.sql',
  '26091206_live_transcript_quotes.sql',
  '26091301_communications_and_orders.sql',
  '26091302_organization_workspaces.sql',
  '26091303_supplier_call_queue.sql',
  '26091304_automated_sourcing_and_purchase.sql',
  '26091305_harden_automated_purchase.sql',
  '26091306_owner_completion_notifications.sql',
  '26091307_multi_member_orgs_and_request_creator.sql',
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
    const created=await db.query<{id:string}>('select id from public.create_procurement_request_with_policy($1,$2)',[userA,{item:'Chicken',quantity:30,unit:'kg',budget:350,deadline:'2026-09-14T08:00:00+10:00',location:'Melbourne',purchaseMode:'confirm',minimumPaymentDays:14,maximumDepositPercent:0}])
    const createdRequestId=created.rows[0].id
    await db.query('insert into public.suppliers(organization_id,name,abn,phone,email) values ($1,$2,$3,$4,$5)',[userA,'Example','51824753556','03 9000 0000','orders@example.com'])
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
    expect((await db.query<{created_by:string|null}>('select created_by from public.procurement_requests where id=$1',[createdRequestId])).rows).toEqual([{created_by:userA}])

    const added=await db.query<{add_organization_member:string}>("select public.add_organization_member($1,'sam@example.com')",[businessId])
    expect(added.rows).toEqual([{add_organization_member:userB}])
    expect((await db.query('select user_id,role from public.organization_members where organization_id=$1 order by user_id',[businessId])).rows).toEqual([{user_id:userA,role:'owner'},{user_id:userB,role:'member'}])
    expect((await db.query('select id from public.profiles order by id')).rows).toEqual([{id:userA},{id:userB}])
    const automatic=await db.query<{id:string}>('select id from public.create_procurement_request_with_policy($1,$2)',[userA,{item:'Chicken',quantity:30,unit:'kg',budget:350,deadline:'2026-09-14T08:00:00+10:00',location:'Melbourne',purchaseMode:'preauthorized',minimumPaymentDays:14,maximumDepositPercent:0}])
    expect((await db.query('select created_by from public.procurement_requests where id=$1',[automatic.rows[0].id])).rows).toEqual([{created_by:userA}])
    expect((await db.query('select auto_purchase,preauthorized_by is not null as has_actor,authorization_snapshot is not null as has_snapshot from public.negotiation_policies where request_id=$1',[automatic.rows[0].id])).rows).toEqual([{auto_purchase:true,has_actor:true,has_snapshot:true}])
    await expect(db.query('update public.negotiation_policies set maximum_total_cents=999999 where request_id=$1',[automatic.rows[0].id])).rejects.toThrow()

    await db.exec(`set request.jwt.claim.sub='${userB}';`)
    const memberRequest=await db.query<{id:string}>('select id from public.create_procurement_request_with_policy($1,$2)',[businessId,{item:'Beef',quantity:10,unit:'kg',budget:100,deadline:'2026-09-14T08:00:00+10:00',location:'Melbourne',purchaseMode:'confirm',minimumPaymentDays:14,maximumDepositPercent:0}])
    expect((await db.query('select created_by from public.procurement_requests where id=$1',[memberRequest.rows[0].id])).rows).toEqual([{created_by:userB}])
    await expect(db.query("select public.add_organization_member($1,'taylor@example.com')",[businessId])).rejects.toThrow('Only an owner or administrator')
    await expect(db.query('select id from public.create_procurement_request_with_policy($1,$2)',[businessId,{item:'Lamb',quantity:5,unit:'kg',budget:90,deadline:'2026-09-14T08:00:00+10:00',location:'Melbourne',purchaseMode:'preauthorized',minimumPaymentDays:14,maximumDepositPercent:0}])).rejects.toThrow('Only an owner or administrator')
    expect((await db.query<{id:string}>('select id from public.procurement_requests')).rows).toEqual([{id:memberRequest.rows[0].id}])
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(2)

    await db.exec(`set request.jwt.claim.sub='${userA}';`)

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
    const requestId=createdRequestId
    const supplierId=(await db.query<{id:string}>('select id from public.suppliers where organization_id=$1 limit 1',[userA])).rows[0].id
    await db.query('update public.suppliers set authorised=true,authorised_at=now() where id=$1',[supplierId])
    await db.query('insert into public.supplier_verifications(supplier_id,organization_id,active,legal_name,name_matched,contact_confirmed,checked_at) values ($1,$2,true,$3,true,true,now())',[supplierId,userA,'Example'])
    const quote=(await db.query<{id:string}>('insert into public.supplier_quotes(organization_id,request_id,supplier_id,total_cents,quantity,payment_days,deposit_bps,terms_confirmed,details,needs_review) values ($1,$2,$3,30000,30,14,0,true,$4,false) returning id',[userA,requestId,supplierId,{available:true,specificationConfirmed:true,isSubstitution:false,deliveryTime:'2026-09-14T07:00:00+10:00',certifications:[]}])).rows[0]
    await db.query('insert into public.communication_events(organization_id,request_id,supplier_id,quote_id,channel,purpose,recipient,payload,idempotency_key) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[userA,requestId,supplierId,quote.id,'voice','owner_completion','+61400000000',{summary:'PO issued'},'completion-test'])
    expect((await db.query('select id from public.communication_events where purpose=$1',['owner_completion'])).rows).toHaveLength(1)
    const automaticQuote=(await db.query<{id:string}>('insert into public.supplier_quotes(organization_id,request_id,supplier_id,total_cents,quantity,payment_days,deposit_bps,terms_confirmed,details,needs_review) values ($1,$2,$3,30000,30,14,0,true,$4,false) returning id',[userA,automatic.rows[0].id,supplierId,{available:true,specificationConfirmed:true,isSubstitution:true,deliveryTime:'2026-09-14T07:00:00+10:00',certifications:[]}])).rows[0]
    const queueItem=(await db.query<{id:string}>('insert into public.supplier_call_queue(organization_id,request_id,supplier_id,created_by) values ($1,$2,$3,$1) returning id',[userA,requestId,supplierId])).rows[0]
    await db.query('insert into public.supplier_calls(organization_id,request_id,supplier_id,queue_item_id) values ($1,$2,$3,$4),($1,$2,$3,$4)',[userA,requestId,supplierId,queueItem.id])
    expect((await db.query('select id from public.supplier_calls where queue_item_id=$1',[queueItem.id])).rows).toHaveLength(2)
    await db.exec('set role service_role;')
    const worker='44444444-4444-4444-8444-444444444444'
    const claimed=await db.query<{status:string;attempt_count:number}>('select status,attempt_count from public.claim_next_supplier_call($1,$2,$3,120)',[userA,requestId,worker])
    expect(claimed.rows).toEqual([{status:'processing',attempt_count:1}])
    expect((await db.query('select id from public.claim_next_supplier_call($1,$2,$3,120)',[userA,requestId,worker])).rows).toHaveLength(0)
    await db.query("update public.supplier_call_queue set status='calling',lease_expires_at=now()-interval '1 second' where request_id=$1",[requestId])
    expect((await db.query('select id from public.claim_next_supplier_call($1,$2,$3,120)',[userA,requestId,worker])).rows).toHaveLength(0)
    expect((await db.query<{status:string}>('select status from public.supplier_call_queue where request_id=$1',[requestId])).rows).toEqual([{status:'uncertain'}])
    const orderId='55555555-5555-4555-8555-555555555555'
    const firstOrder=await db.query<{id:string;created:boolean}>('select id,created from public.claim_purchase_order($1,$2,$3,$4,$5,$6,$7)',[userA,quote.id,orderId,'SP-TEST-1',{source:'test'},userA,'explicit'])
    expect(firstOrder.rows).toEqual([{id:orderId,created:true}])
    expect((await db.query<{id:string;created:boolean}>('select id,created from public.claim_purchase_order($1,$2,$3,$4,$5,$6,$7)',[userA,quote.id,'66666666-6666-4666-8666-666666666666','SP-TEST-2',{source:'retry'},userA,'explicit'])).rows).toEqual([{id:orderId,created:false}])
    await expect(db.query('select id from public.claim_purchase_order($1,$2,$3,$4,$5,$6,$7)',[userA,automaticQuote.id,'77777777-7777-4777-8777-777777777777','SP-AUTO-BLOCKED',{source:'auto'},userA,'preauthorized'])).rejects.toThrow('Substitution')
    await db.query("update public.supplier_quotes set details=jsonb_set(details,'{isSubstitution}','false') where id=$1",[automaticQuote.id])
    expect((await db.query<{created:boolean}>('select created from public.claim_purchase_order($1,$2,$3,$4,$5,$6,$7)',[userA,automaticQuote.id,'77777777-7777-4777-8777-777777777777','SP-AUTO-1',{source:'auto'},userA,'preauthorized'])).rows).toEqual([{created:true}])
    await db.exec('reset role; set role anon;')
    await expect(db.query('select * from public.suppliers')).rejects.toThrow()
    await expect(db.query('select * from public.supplier_call_queue')).rejects.toThrow()
    await expect(db.query('select * from public.claim_purchase_order($1,$2,$3,$4,$5,$6,$7)',[userA,quote.id,'88888888-8888-4888-8888-888888888888','SP-DENIED',{source:'denied'},userA,'explicit'])).rejects.toThrow()
  }finally{await db.close()}
},30000)
