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
test('50/day ceiling holds across repeats; a later day picks up the remainder including late-safe signups',async()=>{
 const h=harness(Array.from({length:51},(_,i)=>row(i+1)));let r=await runDaily(h.io,{apply:true,now});assert.equal(r.newAccepted,50);assert.equal(r.remainingEligible,1);r=await runDaily(h.io,{apply:true,now});assert.equal(r.newAccepted,0);assert.equal(h.posts.length,50);r=await runDaily(h.io,{apply:true,now:new Date(now.getTime()+86400000)});assert.equal(r.newAccepted,1);assert.equal(r.remainingEligible,0);
});
test('blocked old reservations are canceled while the opt-out state and cancel marker remain',async()=>{
 const r=row(),old=scheduled(r);r.properties.Status.select.name='Unsubscribed';const h=harness([r],{mails:[old]});await runDaily(h.io,{apply:true,now});assert.equal(h.posts.length,0);assert.ok(dateOf(h.rows[0],P.canceled));assert.equal(h.rows[0].properties.Status.select.name,'Unsubscribed');
});
test('preview is read-only and never cancels or sends',async()=>{
 const r=row(),old=scheduled(r),h=harness([r],{mails:[old]});const x=await runDaily(h.io,{now});assert.equal(x.legacyReservations,1);assert.equal(h.calls.length,0);assert.equal(h.posts.length,0);
});
