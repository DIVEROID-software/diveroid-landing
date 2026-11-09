import test from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_ID,richText,emailOf} from '../lib/subscriptions.mjs';
import {CAMPAIGN,P,readState,textOf,dateOf,hashEmail} from '../lib/newsletter.mjs';
import {dailyLanguage,selectDaily,runDaily,renderDaily,TEMPLATE,PRELAUNCH_URL} from '../lib/newsletter-daily.mjs';
process.env.NEWSLETTER_TOKEN_SECRET='isolated-daily-test-only-secret-123456789';
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const now=new Date('2026-11-09T06:00:00Z');
function row(n=1,country='US'){
 return {id:id(n),parent:{database_id:DATABASE_ID},properties:{Email:{title:[{text:{content:`subscriber${n}@example.com`}}]},Country:richText(country),Language:{select:{name:'KO'}},Status:{select:{name:'New'}},'Reoon Status':{select:{name:'safe'}}}};
}
function harness(input,options={}){
 const rows=structuredClone(input),mails=new Map(options.mails||[]),calls=[],posts=[];let next=8000;
 const getRow=async key=>rows.find(x=>x.id===key);
 const updatePage=async(key,props)=>{const r=await getRow(key);r.properties={...r.properties,...structuredClone(props)};return r};
 const io={queryPages:async()=>structuredClone(rows),getRow:async key=>structuredClone(await getRow(key)),updatePage,suppressedEmails:async()=>new Set(options.suppressed||[]),
  recordEvent:async e=>{const r=await getRow(e.data.tags.notion_page);if(['email.sent','email.delivered'].includes(e.type))r.properties[P.sent]={date:{start:e.created_at}};if(e.type==='email.delivered')r.properties[P.delivered]={date:{start:e.created_at}};},
  resend:async(path,req={})=>{calls.push({path,method:req.method||'GET'});
   if(path==='usage')return {emails:{daily:{used:0,limit:null},monthly:{used:0,limit:null}}};
   if(path==='emails'){
    posts.push(req);
    if(options.sendError)throw options.sendError;
    const receipt=id(next++);mails.set(receipt,{id:receipt,to:req.body.to,last_event:'delivered'});return {id:receipt};
   }
   if(path.endsWith('/cancel')){
    const key=path.split('/')[1],m=mails.get(key);
    m.last_event=options.cancelRace?'sent':options.cancelUnconfirmed?'scheduled':'canceled';return {id:key};
   }
   const m=mails.get(path.split('/')[1]);if(!m)throw Error('missing_fake_email');return structuredClone(m);
  }};
 return {io,rows,calls,posts,mails};
}
function scheduled(r,n=9000){const old=id(n);r.properties[P.id]=richText(old);r.properties[P.data]=richText(JSON.stringify({campaign:CAMPAIGN,language:'en',at:'2026-11-09T13:00:00Z',attemptAt:'2026-11-08T06:00:00Z',emailHash:hashEmail(emailOf(r)),phase:'scheduled',template:'20261103-approved-v1'}));return [old,{id:old,to:[emailOf(r)],last_event:'scheduled',scheduled_at:'2026-11-09T13:00:00Z'}];}
test('Korean routing uses explicit country, Korean browser or Korean mail service; legacy KO alone stays English',()=>{
 assert.equal(dailyLanguage(row(1,'KR')).language,'ko');assert.equal(dailyLanguage(row(1,'GB')).language,'en');
 const r=row(2,'');r.properties['Browser Language']=richText('ko-KR');assert.equal(dailyLanguage(r).language,'ko');
 r.properties['Browser Language']=richText('');r.properties.Email.title[0].text.content='reader@naver.com';assert.equal(dailyLanguage(r).language,'ko');
});
test('only safe rows enter; duplicate opt-outs, test/internal mail and ambiguous attempts are excluded',()=>{
 const a=row(1),b=row(2),c=row(3),d=row(4),e=row(5),f=row(6);b.properties.Email=a.properties.Email;b.properties.Status.select.name='Unsubscribed';
 c.properties['Reoon Status'].select.name='catch_all';d.properties.Email.title[0].text.content='jay@diveroid.com';e.properties.Email.title[0].text.content='test+123@gmail.com';f.properties[P.data]=richText(JSON.stringify({campaign:CAMPAIGN,attemptAt:now.toISOString()}));
 assert.equal(selectDaily([a,b,c,d,e,f]).candidates.length,0);
});
test('immediate templates preserve sender, signed opt-out and exact requested Prelaunch fragment in both languages',()=>{
 for(const language of ['ko','en']){const r=row(),state={campaign:CAMPAIGN,language,at:now.toISOString(),emailHash:hashEmail(emailOf(r)),template:TEMPLATE};const m=renderDaily(r,state);
  assert.equal(m.from,'DIVEROID <help@diveroid.com>');assert.equal(m.reply_to,'help@diveroid.com');assert.equal(m.scheduled_at,undefined);assert.ok(m.text.includes(PRELAUNCH_URL));assert.ok(m.html.includes(PRELAUNCH_URL.replaceAll('&','&amp;')));assert.ok(m.headers['List-Unsubscribe'].includes('action=unsubscribe'));assert.ok(!m.html.includes('href="https://watchdive.diveroid.com/'));assert.ok(!m.html.includes('December'));assert.ok(!m.html.includes('12월'));
 }
});
test('a confirmed old cancellation is required before a new immediate message; repeats never resend',async()=>{
 const r=row(),old=scheduled(r),h=harness([r],{mails:[old]});const x=await runDaily(h.io,{apply:true,now});
 assert.equal(x.replacedReservations,1);assert.equal(x.newAccepted,1);assert.equal(x.remainingEligible,0);assert.equal(readState(h.rows[0]).replacedReservations[0].providerId,old[0]);assert.ok(dateOf(h.rows[0],P.sent));assert.equal(h.posts.length,1);
 await runDaily(h.io,{apply:true,now});assert.equal(h.posts.length,1);
});
test('unconfirmed cancellation retains the old provider ID and prevents replacement',async()=>{
 const r=row(),old=scheduled(r),h=harness([r],{mails:[old],cancelUnconfirmed:true});const x=await runDaily(h.io,{apply:true,now});assert.equal(x.newAccepted,0);assert.equal(x.failures,1);assert.equal(textOf(h.rows[0],P.id),old[0]);assert.equal(h.posts.length,0);
});
test('a provider send racing cancellation is reconciled rather than sent again',async()=>{
 const r=row(),old=scheduled(r),h=harness([r],{mails:[old],cancelRace:true});const x=await runDaily(h.io,{apply:true,now});assert.equal(x.newAccepted,0);assert.equal(x.reconciled,1);assert.ok(dateOf(h.rows[0],P.sent));
});
test('provider recipient mismatch never cancels or sends',async()=>{
 const r=row(),old=scheduled(r);old[1].to=['another@example.com'];const h=harness([r],{mails:[old]});await runDaily(h.io,{apply:true,now});assert.equal(h.posts.length,0);assert.equal(h.calls.filter(x=>x.path.endsWith('/cancel')).length,0);
});
test('uncertain send preserves its claim; a subsequent run cannot issue a second POST',async()=>{
 const h=harness([row()],{sendError:Error('response_unknown')});await runDaily(h.io,{apply:true,now});assert.equal(h.posts.length,1);assert.ok(readState(h.rows[0]).attemptAt);await runDaily(h.io,{apply:true,now:new Date(now.getTime()+86400000)});assert.equal(h.posts.length,1);
});
test('a definitive 429 can return to the queue without claiming delivery',async()=>{
 const h=harness([row()],{sendError:{status:429}});await runDaily(h.io,{apply:true,now});assert.equal(readState(h.rows[0]).phase,'planned');assert.equal(readState(h.rows[0]).attemptAt,undefined);assert.equal(dateOf(h.rows[0],P.sent),undefined);
});
test('more than 50 eligible recipients can send on one day while repeats still cannot resend',async()=>{
 const h=harness(Array.from({length:112},(_,i)=>row(i+1)));let r=await runDaily(h.io,{apply:true,now});assert.equal(r.newAccepted,112);assert.equal(r.remainingEligible,0);assert.equal(r.quota.campaignDailyLimit,null);assert.equal(r.quota.campaignLimitPolicy,'unlimited');r=await runDaily(h.io,{apply:true,now});assert.equal(r.newAccepted,0);assert.equal(h.posts.length,112);
});
test('removing the campaign cap never bypasses provider quota or verification-mail headroom',async()=>{
 const h=harness(Array.from({length:6},(_,i)=>row(i+1))),provider=h.io.resend;h.io.resend=async(path,...args)=>path==='usage'?{emails:{daily:{used:65,limit:100},monthly:{used:1000,limit:3000}}}:provider(path,...args);
 const r=await runDaily(h.io,{apply:true,now});assert.equal(r.newAccepted,5);assert.equal(r.remainingEligible,1);assert.equal(r.quota.allowance,5);
});
test('blocked old reservations are canceled while the opt-out state and cancel marker remain',async()=>{
 const r=row(),old=scheduled(r);r.properties.Status.select.name='Unsubscribed';const h=harness([r],{mails:[old]});await runDaily(h.io,{apply:true,now});assert.equal(h.posts.length,0);assert.ok(dateOf(h.rows[0],P.canceled));assert.equal(h.rows[0].properties.Status.select.name,'Unsubscribed');
});
test('preview is read-only and never cancels or sends',async()=>{
 const r=row(),old=scheduled(r),h=harness([r],{mails:[old]});const x=await runDaily(h.io,{now});assert.equal(x.legacyReservations,1);assert.equal(h.calls.length,0);assert.equal(h.posts.length,0);
});
test('one-off skips verification and Hold only for the existing snapshot, without modifying either saved field',async()=>{
 const statuses=['error','invalid','disposable','unknown','catch_all','role_account','inbox_full','safe'];
 const rows=statuses.map((s,i)=>{const r=row(i+1);r.created_time='2026-11-08T00:00:00Z';r.properties['Reoon Status'].select.name=s;if(s==='safe')r.properties.Status.select.name='Hold';return r});
 const future=row(99);future.created_time='2026-11-09T07:00:00Z';future.properties['Reoon Status'].select.name='error';rows.push(future);
 const h=harness(rows);const result=await runDaily(h.io,{apply:true,now,authorizeOneOff:true});
 assert.equal(result.newAccepted,8);assert.equal(h.rows[7].properties.Status.select.name,'Hold');
 assert.deepEqual(h.rows.slice(0,8).map(r=>r.properties['Reoon Status'].select.name),statuses);
 await runDaily(h.io,{apply:true,now});assert.equal(h.posts.length,8);
});
test('one-off keeps unsubscribe, provider suppression, internal/test, duplicate and uncertain-submit exclusions',async()=>{
 const rows=Array.from({length:8},(_,i)=>{const r=row(i+1);r.created_time='2026-11-08T00:00:00Z';r.properties['Reoon Status'].select.name='error';return r});
 rows[0].properties.Status.select.name='Unsubscribed';rows[1].properties.Email=rows[0].properties.Email;
 rows[2].properties.Email.title[0].text.content='test+123@gmail.com';rows[3].properties.Email.title[0].text.content='jay@diveroid.com';
 rows[4].properties[P.data]=richText(JSON.stringify({campaign:CAMPAIGN,attemptAt:now.toISOString()}));
 rows[5].properties[P.sent]={date:{start:now.toISOString()}};rows[6].properties.Email.title[0].text.content='bad-address';
 const h=harness(rows,{suppressed:['subscriber8@example.com']});const r=await runDaily(h.io,{apply:true,now,authorizeOneOff:true});assert.equal(r.newAccepted,0);assert.equal(r.oneOffEnrollment,0);
});
test('enrolled one-off recipients survive provider quota waiting; new rows still require safe status',async()=>{
 const r=row();r.created_time='2026-11-08T00:00:00Z';r.properties['Reoon Status'].select.name='error';const h=harness([r]);
 const provider=h.io.resend;h.io.resend=async(path,...args)=>path==='usage'?{emails:{daily:{used:100,limit:100},monthly:{used:1000,limit:3000}}}:provider(path,...args);
 const first=await runDaily(h.io,{apply:true,now,authorizeOneOff:true});assert.equal(first.newAccepted,0);assert.equal(first.remainingEligible,1);
 const future=row(99);future.properties['Reoon Status'].select.name='error';h.rows.push(future);h.io.resend=provider;
 const later=await runDaily(h.io,{apply:true,now:new Date(now.getTime()+86400000)});assert.equal(later.newAccepted,1);assert.equal(h.posts.length,1);
});
test('one-off grant is bound to the email identity and cannot be transferred by editing an address',async()=>{
 const r=row();r.created_time='2026-11-08T00:00:00Z';r.properties['Reoon Status'].select.name='error';const h=harness([r]);
 const provider=h.io.resend;h.io.resend=async(path,...args)=>path==='usage'?{emails:{daily:{used:100,limit:100},monthly:{used:1000,limit:3000}}}:provider(path,...args);
 await runDaily(h.io,{apply:true,now,authorizeOneOff:true});h.rows[0].properties.Email.title[0].text.content='changed@example.com';h.io.resend=provider;
 await runDaily(h.io,{apply:true,now});assert.equal(h.posts.length,0);
});
