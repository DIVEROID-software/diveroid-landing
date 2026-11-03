import {createHash} from 'node:crypto';
import {notion,queryPages,updatePage,emailOf,richText} from '../lib/subscriptions.mjs';
import {CAMPAIGN,P,DAILY_LIMIT,END,scheduledTime,planRows,readState,exclusion,renderMessage,resend,suppressedEmails,cancelScheduled,recordEvent,metrics,dateProp,dateOf,textOf,hashEmail} from '../lib/newsletter.mjs';

const apply=process.argv.includes('--apply');
const now=new Date();
const rows=await queryPages(undefined,100000);
const suppressed=await suppressedEmails();
const plan=planRows(rows,now,suppressed);
const counts={mode:apply?'apply':'dry-run',rows:rows.length,newPlans:plan.plans.length,excluded:plan.excluded.size,scheduled:0,canceled:0,reconciled:0,held:0,failures:0};
if(!apply){console.log(JSON.stringify({...counts,byDay:plan.plans.reduce((a,x)=>{const k=x.state.at;a[k]=(a[k]||0)+1;return a;},{}),current:metrics(rows)}));process.exit(0);}
if(process.env.NEWSLETTER_ENABLED!=='true')throw new Error('newsletter_disabled');
const sleep=()=>new Promise(r=>setTimeout(r,350));

for(const [id,why] of plan.excluded){const row=rows.find(r=>r.id===id);if(textOf(row,P.reason)!==why){await updatePage(id,{[P.reason]:richText(why)});await sleep();}}
for(const {row,state} of plan.plans){
  const props={[P.data]:richText(JSON.stringify(state)),[P.plan]:dateProp(state.at),[P.language]:{select:{name:state.language.toUpperCase()}},[P.reason]:richText('')};
  await updatePage(row.id,props);row.properties={...row.properties,...props};await sleep();
}
const blocked=new Set(rows.filter(r=>['Unsubscribed','Hold'].includes(r.properties?.Status?.select?.name)).map(emailOf));
const stateRows=rows.filter(r=>readState(r).campaign===CAMPAIGN);
const dailySlots=new Map();for(const r of stateRows){const day=readState(r).at?.slice(0,10);if(day)dailySlots.set(day,(dailySlots.get(day)||0)+1);}
const today=now.toISOString().slice(0,10);
let submissionsToday=stateRows.filter(r=>(readState(r).submittedAt||(textOf(r,P.id)?readState(r).attemptAt:''))?.startsWith(today)).length;
const usage=await resend('usage');
// Preserve headroom for the existing verification and reservation mail flows.
let allowance=Math.max(0,Math.min(DAILY_LIMIT-submissionsToday,(usage.emails?.daily?.limit??0)-(usage.emails?.daily?.used??0)-30,(usage.emails?.monthly?.limit??0)-(usage.emails?.monthly?.used??0)-100));

for(const initial of stateRows){
  let row=await notion(`pages/${initial.id}`);let state=readState(row);
  const why=blocked.has(emailOf(row))?'동일 이메일 수신 거부 또는 보류':exclusion(row,suppressed);
  if(why||state.emailHash!==hashEmail(emailOf(row))){
    if(textOf(row,P.id)&&!dateOf(row,P.sent)&&!dateOf(row,P.canceled)){try{await cancelScheduled(row);counts.canceled++;}catch{counts.failures++;}}
    else if(!textOf(row,P.id)&&!dateOf(row,P.canceled))await updatePage(row.id,{[P.canceled]:dateProp(new Date().toISOString())});
    if(textOf(row,P.reason)!==why)await updatePage(row.id,{[P.reason]:richText(why||'예약 후 이메일 변경')});
    await sleep();continue;
  }
  if(dateOf(row,P.canceled))continue;
  if(textOf(row,P.id)){
    // Webhooks are primary. Reconcile missing terminal delivery receipts after
    // a send, without overwriting a first-open timestamp or resending anything.
    if(!dateOf(row,P.delivered)&&!textOf(row,P.failure)&&Date.parse(state.at)<Date.now()-300000){
      try{const mail=await resend(`emails/${textOf(row,P.id)}`);if(['sent','delivered','bounced','failed','complained','suppressed'].includes(mail.last_event)){
        await recordEvent({type:`email.${mail.last_event}`,created_at:new Date().toISOString(),data:{email_id:textOf(row,P.id),to:[emailOf(row)],tags:{campaign:CAMPAIGN,notion_page:row.id}}});counts.reconciled++;
      }}catch{counts.failures++;}
    }
    await sleep();continue;
  }
  if(textOf(row,P.failure)||state.phase==='manual_review'){counts.held++;continue;}
  if(Date.parse(state.at)<Date.now()+600000){
    if(state.attemptAt){await updatePage(row.id,{[P.failure]:richText('예약 시간 경과 — 이전 요청 결과 확인 필요')});counts.held++;continue;}
    // A never-attempted or definitively rejected send may move to the next
    // readable slot. An uncertain provider request must never be moved/replayed.
    let day=new Date().toISOString().slice(0,10);
    while(day<=END&&((dailySlots.get(day)||0)>=DAILY_LIMIT||Date.parse(scheduledTime(day,state.language))<Date.now()+3600000))day=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
    if(day>END){await updatePage(row.id,{[P.failure]:richText('사전 공개 캠페인 종료 — 미발송')});continue;}
    dailySlots.set(state.at.slice(0,10),Math.max(0,(dailySlots.get(state.at.slice(0,10))||0)-1));dailySlots.set(day,(dailySlots.get(day)||0)+1);
    state={...state,at:scheduledTime(day,state.language)};
    await updatePage(row.id,{[P.data]:richText(JSON.stringify(state)),[P.plan]:dateProp(state.at)});
  }
  if(Date.parse(state.at)>Date.now()+36*3600000||allowance<=0){counts.held++;continue;}
  const message=renderMessage(row,state),digest=createHash('sha256').update(JSON.stringify(message)).digest('hex');
  if(state.attemptAt&&(Date.now()-Date.parse(state.attemptAt)>23*3600000||state.payloadHash!==digest)){
    await updatePage(row.id,{[P.failure]:richText('이전 요청 결과 확인 필요 — 자동 재발송 중지')});counts.held++;continue;
  }
  if(!state.attemptAt){state={...state,phase:'submitting',attemptAt:new Date().toISOString(),payloadHash:digest};await updatePage(row.id,{[P.data]:richText(JSON.stringify(state))});}
  try{
    const result=await resend('emails',{method:'POST',body:message,key:`${CAMPAIGN}-${row.id}`});
    if(!/^[a-f0-9-]{36}$/.test(result.id||''))throw new Error('invalid_provider_receipt');
    await updatePage(row.id,{[P.id]:richText(result.id),[P.data]:richText(JSON.stringify({...state,phase:'scheduled',submittedAt:new Date().toISOString()})),[P.reason]:richText('')});
    allowance--;counts.scheduled++;
  }catch(error){
    counts.failures++;
    if(error.status===429){
      const retry={...state,phase:'planned'};delete retry.attemptAt;delete retry.payloadHash;
      await updatePage(row.id,{[P.data]:richText(JSON.stringify(retry)),[P.reason]:richText('발송 서비스 한도 대기')});break;
    }
    if(error.status>=400&&error.status<500&&error.status!==409)await updatePage(row.id,{[P.failure]:richText(`예약 실패 (${error.status})`)});
    // Timeout/5xx/unknown: retain the immutable payload and original key.
    // Replays within 23h use the same payload; older uncertainty is held above.
  }
  await sleep();
}
const fresh=await queryPages(undefined,100000);const report=metrics(fresh);
if(process.env.NEWSLETTER_REPORT_BLOCK){
  const text=`WatchDive 소개 메일 · ${new Date().toISOString()} UTC 기준\n대상 ${report.total}명 (한글 ${report.ko} / 영문 ${report.en})\n예약 완료 ${report.scheduled} · 예약 대기 ${report.queued} · 발송 ${report.sent} · 전달 ${report.delivered}\n고유 열람 ${report.uniqueOpened} · 오픈율 ${report.openRate===null?'아직 전달 없음':(report.openRate*100).toFixed(1)+'%'}\n실패 ${report.failed} · 취소 ${report.canceled}\n오픈율 = 전달된 메일 중 1회 이상 이미지가 로드된 수신자 / 전달 완료 수신자. 이미지 차단·자동 로딩으로 실제 읽음과 다를 수 있습니다. 테스트 주소는 캠페인 대상에 포함하지 않습니다.`;
  await notion(`blocks/${process.env.NEWSLETTER_REPORT_BLOCK}`,{method:'PATCH',body:{paragraph:{rich_text:[{type:'text',text:{content:text}}]}}});
}
console.log(JSON.stringify({...counts,report}));
if(counts.failures)process.exitCode=1;
