import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {Webhook} from 'svix';
import {CAMPAIGN,P,languageFor,planRows,tokenFor,verifyToken,renderMessage,metrics,exclusion,hashEmail} from '../lib/newsletter.mjs';
import handler from '../api/newsletter-webhook.js';
import {DATABASE_ID,richText} from '../lib/subscriptions.mjs';

process.env.NEWSLETTER_TOKEN_SECRET='test-only-secret-not-for-production-123456789';
function row(n=1,country='KR',state={}){return {id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,parent:{database_id:DATABASE_ID},properties:{Email:{title:[{text:{content:`subscriber${n}@example.com`}}]},Country:richText(country),Status:{select:{name:'New'}},'Reoon Status':{select:{name:'safe'}},[P.data]:richText(JSON.stringify(state))}};}
test('KR is the only Korean routing signal, including legacy Language=KO',()=>{assert.equal(languageFor('KR'),'ko');for(const c of ['',null,'US','GB','Korea','XX'])assert.equal(languageFor(c),'en');});
test('pending, risky, unsubscribed, held, archived and provider suppressions cannot enter the campaign',()=>{
  for(const s of ['Unsubscribed','Hold']){const r=row();r.properties.Status.select.name=s;assert.ok(exclusion(r));}
  for(const s of ['pending','unknown','invalid','error','disposable','spamtrap','catch_all','role_account']){const r=row();r.properties['Reoon Status'].select.name=s;assert.ok(exclusion(r));}
  assert.ok(exclusion({...row(),archived:true}));assert.ok(exclusion(row(),new Set(['subscriber1@example.com'])));
});
test('112 recipients start tomorrow in their language time slots with a 100/day ceiling',()=>{
  const rows=Array.from({length:112},(_,i)=>row(i+1,i<86?'KR':''));const p=planRows(rows,new Date('2026-11-03T11:00:00Z'));
  assert.equal(p.plans.length,112);const counts={};
  for(const {state:s} of p.plans){assert.equal(s.at.slice(11,13),s.language==='ko'?'01':'13');assert.ok(s.at>='2026-11-04');counts[s.at.slice(0,10)]=(counts[s.at.slice(0,10)]||0)+1;}
  assert.deepEqual(Object.values(counts),[100,12]);
});
test('existing reservations and duplicate opt-outs prevent repeat admission',()=>{
  const a=row(),b=row(2);b.properties.Email=a.properties.Email;b.properties.Status.select.name='Unsubscribed';assert.equal(planRows([a,b],new Date('2026-11-03')).plans.length,0);
  a.properties[P.data]=richText(JSON.stringify({campaign:CAMPAIGN,at:'2026-11-04T01:00:00.000Z'}));assert.equal(planRows([a,row()],new Date('2026-11-03')).plans.length,0);
});
test('late/new signups keep readable future slots, and expired December copy is not sent',()=>{
  const p=planRows([row()],new Date('2026-11-04T01:01:00Z'));assert.equal(p.plans[0].state.at,'2026-11-05T01:00:00.000Z');
  assert.equal(planRows([row()],new Date('2026-12-01')).plans.length,0);
});
test('tokens are recipient-bound, purpose-bound and tamper-resistant',()=>{
  const r=row(),t=tokenFor(r,'unsubscribe');assert.equal(verifyToken(t,'unsubscribe').p,r.id);
  assert.throws(()=>verifyToken(t,'open'));assert.throws(()=>verifyToken(t+'x','unsubscribe'));
  assert.notEqual(tokenFor(row(2),'unsubscribe'),t);assert.ok(!t.includes('example.com'));
});
test('approved mail has one recipient, stable payload, a signed unsubscribe and a campaign-only pixel',()=>{
  const r=row(),s={campaign:CAMPAIGN,language:'ko',at:'2026-11-04T01:00:00.000Z',emailHash:hashEmail('subscriber1@example.com')};
  const a=renderMessage(r,s);assert.deepEqual(a,renderMessage(r,s));assert.deepEqual(a.to,['subscriber1@example.com']);assert.equal(a.from,'DIVEROID <help@diveroid.com>');assert.ok(a.html.includes('action=open'));assert.ok(a.headers['List-Unsubscribe'].includes('action=unsubscribe'));assert.ok(!a.html.includes('{{'));assert.ok(a.text.includes('unsubscribe'));assert.ok(!a.html.includes('<script'));assert.throws(()=>renderMessage(row(2),s));
});
test('open rate is unique opened among delivered, never scheduled or merely sent',()=>{
  const rows=[row(1),row(2),row(3)];for(const r of rows)r.properties[P.data]=richText(JSON.stringify({campaign:CAMPAIGN,language:'en'}));
  rows[0].properties[P.delivered]={date:{start:'2026-11-04T13:00:00Z'}};rows[1].properties[P.delivered]=rows[0].properties[P.delivered];rows[0].properties[P.opened]=rows[0].properties[P.delivered];rows[2].properties[P.opened]=rows[0].properties[P.delivered];
  assert.equal(metrics(rows).openRate,.5);assert.equal(metrics(rows).uniqueOpened,1);assert.equal(metrics([row()]).openRate,null);
});
function response(){return {code:0,body:null,status(n){this.code=n;return this},end(){return this},json(x){this.body=x;return this}};}
test('webhook rejects unsigned/tampered requests and accepts signed irrelevant events without DB writes',async()=>{
  process.env.NEWSLETTER_WEBHOOK_SECRET='whsec_'+Buffer.from('webhook-test-secret-long-enough-123456').toString('base64');
  const body=JSON.stringify({type:'email.sent',data:{tags:{campaign:'another-campaign'}}});
  let req=Readable.from([body]);req.method='POST';req.headers={};let res=response();await handler(req,res);assert.equal(res.code,400);
  const timestamp=new Date();const sig=new Webhook(process.env.NEWSLETTER_WEBHOOK_SECRET).sign('msg_test',timestamp,body);
  req=Readable.from([body]);req.method='POST';req.headers={'svix-id':'msg_test','svix-timestamp':String(Math.floor(timestamp.getTime()/1000)),'svix-signature':sig};res=response();await handler(req,res);assert.equal(res.code,200);
});
