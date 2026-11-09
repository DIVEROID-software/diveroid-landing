import {createHash} from 'node:crypto';
import {emailOf,richText} from './subscriptions.mjs';
import {CAMPAIGN,P,DAILY_LIMIT,exclusion,readState,textOf,dateOf,dateProp,hashEmail,renderMessage,submissionAllowance,metrics} from './newsletter.mjs';

export const ONE_OFF='owner-existing-unsent-without-reoon-20261109';
export const ONE_OFF_CUTOFF='2026-11-09T06:31:00.000Z';
export function hasOneOff(row){const g=readState(row).oneOffAuthorization;return g?.id===ONE_OFF&&g.emailHash===hashEmail(emailOf(row));}
function authorizedView(row){
  if(!hasOneOff(row))return row;
  const r=structuredClone(row);
  if(r.properties?.Status?.select?.name==='Hold')r.properties.Status.select.name='New';
  r.properties['Reoon Status']={select:{name:'safe'}};
  return r;
}

export const TEMPLATE='20261109-prelaunch-daily-v2';
export const PRELAUNCH_URL='https://www.prelaunch.com/projects/watchdive-watchdive-turn-your-smartwatch-into-a-dive-computer#utm_source=Ads&utm_medium=banner&utm_campaign=Watchdive&utm_id=https%3A%2F%2Fwww.prelaunch.com%2Fdashboard%2Fprojects%3Ffrom%3Dbuilder';
const SENT=new Set(['sent','delivered','opened','clicked','delivery_delayed','bounced','complained','suppressed','failed']);
export function dailyLanguage(row){
  const country=textOf(row,'Country').toUpperCase(),browser=textOf(row,'Browser Language').toLowerCase();
  const domain=emailOf(row).split('@')[1];
  if(country==='KR')return {language:'ko',basis:'Country=KR'};
  if(/^ko(?:[-_,;]|$)/.test(browser))return {language:'ko',basis:'Browser Language=ko'};
  if(['naver.com','daum.net','hanmail.net','nate.com','kakao.com'].includes(domain))return {language:'ko',basis:'Korean-language email service'};
  // Legacy Language=KO was the site's default, not proof of nationality.
  return {language:'en',basis:'English default; no reliable Korean signal'};
}
export function dailyExclusion(row,suppressed){
  // The one-off grant changes eligibility only, never the saved Reoon result or consent.
  const why=exclusion(authorizedView(row),suppressed);if(why)return why;
  const email=emailOf(row),[local,domain]=email.split('@');
  if(domain==='diveroid.com'||domain?.endsWith('.diveroid.com'))return '내부 이메일';
  if(/(^|[+._-])(?:test|testing|qa|dummy|sample)(?:[+._-]|\d|$)/i.test(local)||/wdtest\d*/i.test(local))return '테스트 이메일';
  return null;
}
export function selectDaily(rows,suppressed=new Set()){
  const groups=new Map();for(const r of rows){const e=emailOf(r);if(e)groups.set(e,[...(groups.get(e)||[]),r]);}
  const candidates=[],excluded=new Map();
  for(const group of groups.values()){
    const blocked=group.find(r=>r.properties?.Status?.select?.name==='Unsubscribed'||(r.properties?.Status?.select?.name==='Hold'&&!hasOneOff(r)));
    const sent=group.some(r=>dateOf(r,P.sent)||dateOf(r,P.delivered)||textOf(r,P.id));
    let selected=false;
    for(const r of group){
      const why=blocked?'동일 이메일 수신 거부 또는 보류':dailyExclusion(r,suppressed);
      if(why){excluded.set(r.id,why);continue;}
      if(sent){excluded.set(r.id,'이미 발송되었거나 발송 서비스에 접수됨');continue;}
      const s=readState(r);
      if(s.campaign&&s.campaign!==CAMPAIGN){excluded.set(r.id,'다른 발송 이력 확인 필요');continue;}
      if(dateOf(r,P.canceled)||textOf(r,P.failure)||s.attemptAt||['submitting','manual_review'].includes(s.phase)){
        excluded.set(r.id,'취소·실패 또는 이전 요청 결과 확인 필요');continue;
      }
      if(selected){excluded.set(r.id,'동일 이메일 중복 행');continue;}
      selected=true;candidates.push(r);
    }
  }
  return {candidates,excluded};
}
export function renderDaily(row,state){
  if(state.template!==TEMPLATE)throw Error('daily_template_mismatch');
  const message=renderMessage(row,state);delete message.scheduled_at;
  return message;
}
export function assertRecipient(mail,row){
  if(!Array.isArray(mail.to)||mail.to.length!==1||mail.to[0].trim().toLowerCase()!==emailOf(row))throw Error('provider_recipient_mismatch');
}
function event(mail,row,now){
  const status=['opened','clicked','delivery_delayed'].includes(mail.last_event)?'sent':mail.last_event;
  return {type:'email.'+status,created_at:now.toISOString(),data:{email_id:mail.id||textOf(row,P.id),to:[emailOf(row)],tags:{campaign:CAMPAIGN,notion_page:row.id}}};
}

// Dependencies are injected so failure, cancellation and duplicate behavior can
// be verified without real recipients, provider calls or credentials.
export async function runDaily(io,{apply=false,now=new Date(),authorizeOneOff=false}={}){
  const counts={mode:apply?'daily-apply':'daily-dry-run',rows:0,reconciled:0,replacedReservations:0,newAccepted:0,languages:{ko:0,en:0},held:0,failures:0};
  let rows=await io.queryPages(),suppressed=await io.suppressedEmails();counts.rows=rows.length;
  if(authorizeOneOff){
    if(now.getTime()>Date.parse(ONE_OFF_CUTOFF)+86400000)throw Error('one_off_enrollment_closed');
    const proposed=rows.map(r=>{
      if(!Number.isFinite(Date.parse(r.created_time))||Date.parse(r.created_time)>Date.parse(ONE_OFF_CUTOFF))return r;
      const s=readState(r);return {...r,properties:{...r.properties,[P.data]:richText(JSON.stringify({...s,oneOffAuthorization:{id:ONE_OFF,emailHash:hashEmail(emailOf(r)),authorizedAt:now.toISOString(),cutoff:ONE_OFF_CUTOFF}}))}};
    });
    const targets=selectDaily(proposed,suppressed).candidates.filter(hasOneOff);
    counts.oneOffEnrollment=targets.length;
    if(apply){for(const r of targets){if(!hasOneOff(rows.find(x=>x.id===r.id)))await io.updatePage(r.id,{[P.data]:r.properties[P.data]});}rows=await io.queryPages();}
    else rows=proposed;
  }
  if(!apply){const p=selectDaily(rows,suppressed);return {...counts,eligible:p.candidates.length,legacyReservations:rows.filter(r=>textOf(r,P.id)&&!dateOf(r,P.sent)).length,excluded:p.excluded.size,report:metrics(rows)};}
  const sleep=io.sleep||(()=>Promise.resolve());
  // Resolve accepted reservations before considering any replacement send.
  for(const initial of rows){
    if(!textOf(initial,P.id)||dateOf(initial,P.delivered)||textOf(initial,P.failure)||dateOf(initial,P.canceled))continue;
    let row=await io.getRow(initial.id),state=readState(row);const id=textOf(row,P.id);
    if(!id||dateOf(row,P.delivered)||textOf(row,P.failure)||dateOf(row,P.canceled))continue;
    try{
      let mail=await io.resend('emails/'+id);assertRecipient(mail,row);
      if(SENT.has(mail.last_event)){
        await io.recordEvent(event(mail,row,now));counts.reconciled++;await sleep();continue;
      }
      const replacing=state.migration?.providerId===id;
      if(mail.last_event==='scheduled'&&state.template!==TEMPLATE){
        state={...state,migration:{providerId:id,requestedAt:now.toISOString(),originalAt:state.at,reason:'owner_prelaunch_destination_20261109'}};
        await io.updatePage(row.id,{[P.data]:richText(JSON.stringify(state))});
        try{await io.resend('emails/'+id+'/cancel',{method:'POST'});}catch{/* A readback determines the result; never blindly submit a replacement. */}
        mail=await io.resend('emails/'+id);assertRecipient(mail,row);
        if(SENT.has(mail.last_event)){await io.recordEvent(event(mail,row,now));counts.reconciled++;continue;}
        if(mail.last_event!=='canceled')throw Error('provider_cancellation_unconfirmed');
      }else if(!(mail.last_event==='canceled'&&replacing))continue;
      if(mail.last_event==='canceled'){
        const identityBlocked=rows.some(r=>emailOf(r)===emailOf(row)&&['Unsubscribed','Hold'].includes(r.properties?.Status?.select?.name));
        if(identityBlocked||dailyExclusion(row,suppressed)){
          await io.updatePage(row.id,{[P.canceled]:dateProp(now.toISOString()),[P.reason]:richText('발송 제외 대상의 기존 예약 취소 확인')});counts.replacedReservations++;continue;
        }
        const history=[...(state.replacedReservations||[]),{providerId:id,originalAt:state.at,canceledConfirmedAt:now.toISOString()}];
        if(history.length>3)throw Error('too_many_provider_replacements');
        const next={campaign:CAMPAIGN,phase:'planned',emailHash:hashEmail(emailOf(row)),replacedReservations:history,template:TEMPLATE};
        await io.updatePage(row.id,{[P.id]:richText(''),[P.data]:richText(JSON.stringify(next)),[P.canceled]:dateProp(null),[P.reason]:richText('Prelaunch 링크 변경을 위해 이전 예약 취소 확인 완료')});counts.replacedReservations++;
      }
    }catch{counts.failures++;counts.held++;}
    await sleep();
  }
  rows=await io.queryPages();suppressed=await io.suppressedEmails();
  const selection=selectDaily(rows,suppressed);
  for(const [id,reason] of selection.excluded){
    const row=rows.find(r=>r.id===id);
    if(!dateOf(row,P.sent)&&!dateOf(row,P.delivered)&&textOf(row,P.reason)!==reason){await io.updatePage(id,{[P.reason]:richText(reason)});await sleep();}
  }
  const today=now.toISOString().slice(0,10);
  const submissions=rows.filter(r=>{const s=readState(r);return s.campaign===CAMPAIGN&&s.submittedAt?.startsWith(today)}).length;
  const usage=await io.resend('usage');let allowance=submissionAllowance(usage,submissions);
  counts.quota={campaignDailyLimit:Number.isFinite(DAILY_LIMIT)?DAILY_LIMIT:null,campaignLimitPolicy:"unlimited",submissionsToday:submissions,allowance,emails:usage.emails};counts.eligible=selection.candidates.length;
  const seen=new Set(rows.filter(r=>dateOf(r,P.sent)||dateOf(r,P.delivered)||textOf(r,P.id)).map(emailOf));
  for(const candidate of selection.candidates){
    if(allowance<=0){counts.held++;if(textOf(candidate,P.reason)!=='발송 한도 대기 — 다음 일일 점검에서 재확인')await io.updatePage(candidate.id,{[P.reason]:richText('발송 한도 대기 — 다음 일일 점검에서 재확인')});await sleep();continue;}
    const row=await io.getRow(candidate.id);const old=readState(row);
    if(dailyExclusion(row,suppressed)||seen.has(emailOf(row))||textOf(row,P.id)||dateOf(row,P.sent)||dateOf(row,P.canceled)||textOf(row,P.failure)||old.attemptAt){counts.held++;continue;}
    const route=dailyLanguage(row),state={campaign:CAMPAIGN,phase:'submitting',template:TEMPLATE,deliveryMode:'immediate',language:route.language,languageBasis:route.basis,at:now.toISOString(),attemptAt:now.toISOString(),emailHash:hashEmail(emailOf(row)),...(old.oneOffAuthorization?{oneOffAuthorization:old.oneOffAuthorization}:{}),...(old.replacedReservations?{replacedReservations:old.replacedReservations}:{})};
    const message=renderDaily(row,state);state.payloadHash=createHash('sha256').update(JSON.stringify(message)).digest('hex');state.idempotencyKey=CAMPAIGN+'-'+row.id+'-prelaunch-v2';
    await io.updatePage(row.id,{[P.data]:richText(JSON.stringify(state)),[P.plan]:dateProp(state.at),[P.language]:{select:{name:state.language.toUpperCase()}},[P.reason]:richText('')});
    try{
      const result=await io.resend('emails',{method:'POST',body:message,key:state.idempotencyKey});
      if(!/^[a-f0-9-]{36}$/.test(result.id||''))throw Error('provider_receipt_missing');
      await io.updatePage(row.id,{[P.id]:richText(result.id),[P.data]:richText(JSON.stringify({...state,phase:'accepted',submittedAt:now.toISOString()})),[P.reason]:richText('')});
      seen.add(emailOf(row));allowance--;counts.newAccepted++;counts.languages[state.language]++;
      try{const current=await io.getRow(row.id),mail=await io.resend('emails/'+result.id);assertRecipient(mail,current);if(SENT.has(mail.last_event)){await io.recordEvent(event(mail,current,now));counts.reconciled++;}}catch{/* A known provider ID is reconciled by webhook or the next daily run. */}
    }catch(error){
      counts.failures++;
      if(error.status===429){const retry={...state,phase:'planned'};delete retry.attemptAt;delete retry.payloadHash;await io.updatePage(row.id,{[P.data]:richText(JSON.stringify(retry)),[P.reason]:richText('발송 서비스 한도 대기')});break;}
      // The claim survives any uncertain POST or receipt-write failure. No
      // automatic replay occurs after an ambiguous outcome.
      await io.updatePage(row.id,{[P.reason]:richText('발송 요청 결과 확인 필요 — 자동 재발송 보류')});
    }
    await sleep();
  }
  const fresh=await io.queryPages();counts.remainingEligible=selectDaily(fresh,await io.suppressedEmails()).candidates.length;counts.report=metrics(fresh);return counts;
}
