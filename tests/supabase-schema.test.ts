import { test, expect } from 'bun:test'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

test('Supabase schema isolates owners and protects backend-only evidence', async()=>{
 const db=new PGlite()
 const ownerA='11111111-1111-4111-8111-111111111111', ownerB='22222222-2222-4222-8222-222222222222'
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth,public to anon,authenticated,service_role;
   grant execute on function auth.uid() to authenticated;
   insert into auth.users values ('${ownerA}'),('${ownerB}');`)
  for (const migration of ['20260912054141_procurement_workspace.sql','20260912070155_procurement_policy_and_discovery.sql','20260912190000_live_abr_authorisation.sql','20260912203000_supplier_evidence.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'))
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${ownerA}';`)
  await db.query('insert into public.recovery_requests(owner_id,details) values ($1,$2)',[ownerA,{item:'Chicken',quantity:30,budget:350}])
  await db.query('insert into public.supplier_imports(owner_id,name,abn,phone) values ($1,$2,$3,$4)',[ownerA,'Example','51824753556','03 9000 0000'])
  expect((await db.query('select * from public.recovery_requests')).rows).toHaveLength(1)
  await expect(db.query('insert into public.recovery_requests(owner_id,details) values ($1,$2)',[ownerB,{}])).rejects.toThrow()
  await expect(db.query('update public.recovery_requests set owner_id=$1',[ownerB])).rejects.toThrow()
  await expect(db.query("insert into public.supplier_verifications(supplier_id,owner_id,active,legal_name) select id,owner_id,true,name from public.supplier_imports")).rejects.toThrow()
  await db.query('insert into public.discovery_profiles(owner_id,name,business_type,weights,hard_rules) values ($1,$2,$3,$4,$5)',[ownerA,'Hospitality','hospitality',{deliveryFit:25},{abnActive:true}])
  await expect(db.query('insert into public.intake_results(owner_id,source_type,model,normalized,source_hash) values ($1,$2,$3,$4,$5)',[ownerA,'email','gpt-5.6-luna',{},'hash'])).rejects.toThrow()
  await expect(db.query('insert into public.supplier_evidence(owner_id,search_query,supplier_name,website_url,source_url,content_excerpt,extracted_facts,embedding_model,embedding,source_hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[ownerA,'chicken Melbourne','Example','https://example.com','https://example.com','Evidence',{},'text-embedding-3-small',Array(1536).fill(0),'hash'])).rejects.toThrow()
  expect((await db.query("update public.recovery_requests set status='Approved' returning id")).rows).toHaveLength(0)
  await db.exec(`set request.jwt.claim.sub='${ownerB}';`)
  expect((await db.query('select * from public.recovery_requests')).rows).toHaveLength(0)
  expect((await db.query('select * from public.supplier_imports')).rows).toHaveLength(0)
  await db.exec('reset role;')
  expect((await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity")).rows).toHaveLength(0)
  await db.exec("update public.recovery_requests set status='Needs approval';")
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${ownerA}';`)
  expect((await db.query("update public.recovery_requests set status='Approved' returning id")).rows).toHaveLength(1)
  await db.exec('reset role; set role anon;')
  await expect(db.query('select * from public.supplier_imports')).rejects.toThrow()
 } finally {await db.close()}
},30000)
