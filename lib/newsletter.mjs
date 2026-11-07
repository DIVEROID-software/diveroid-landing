import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { notion, queryPages, updatePage, emailOf, plainText, richText, DATABASE_ID } from './subscriptions.mjs';

export const CAMPAIGN = 'watchdive-prelaunch-intro-v1';
export const ORIGIN = 'https://diveroid-landing.vercel.app';
export const START = '2026-11-04';
export const END = '2026-11-30';
export const DAILY_LIMIT = 100;
export const P = { plan:'WatchDive 예약일', sent:'WatchDive 발송일', delivered:'WatchDive 전달일', opened:'WatchDive 첫 열람', failure:'WatchDive 실패', canceled:'WatchDive 취소일', id:'WatchDive Message ID', data:'WatchDive 발송 데이터', language:'WatchDive 발송 언어', status:'WatchDive 발송', reason:'WatchDive 제외 사유' };
export const dateProp = value => ({date:value ? {start:value} : null});
export const dateOf = (row,name) => row.properties?.[name]?.date?.start;
export const textOf = (row,name) => plainText(row.properties?.[name]);
export const languageFor = country => country?.trim().toUpperCase()==='KR' ? 'ko' : 'en';
export const hashEmail = email => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
export const readState = row => { try { return JSON.parse(textOf(row,P.data)||'{}'); } catch { throw new Error('invalid_campaign_state'); } };
export const inDatabase = row => !row.archived && !row.in_trash && (row.parent?.database_id===DATABASE_ID || row.parent?.data_source_id==='303b5179-81ca-8344-9ffc-077f4ca830cc');

export function exclusion(row,suppressed=new Set()) {
  if (!inDatabase(row)) return '보관된 신청';
  const status=row.properties?.Status?.select?.name;
  if(status==='Unsubscribed') return '수신 거부';
  if(status==='Hold') return '운영 보류';
  if(!['New','Notified'].includes(status)) return '상태 확인 필요';
  if(row.properties?.['Reoon Status']?.select?.name!=='safe') return 'Reoon 검증 대기 또는 비정상';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOf(row))) return '이메일 형식 오류';
  if(suppressed.has(emailOf(row))) return '발송 서비스 수신 차단';
  return null;
}

function secret(){const s=process.env.NEWSLETTER_TOKEN_SECRET;if(!s||s.length<32)throw new Error('missing_newsletter_secret');return s;}
export function tokenFor(row,kind){
  const payload=Buffer.from(JSON.stringify({v:1,c:CAMPAIGN,p:row.id,e:hashEmail(emailOf(row)),k:kind})).toString('base64url');
  return `${payload}.${createHmac('sha256',secret()).update(payload).digest('base64url')}`;
}
export function verifyToken(token,kind){
  if(typeof token!=='string'||token.length>1000)throw new Error('invalid_token');
  const [payload,mac,...extra]=token.split('.');
  if(!payload||!mac||extra.length)throw new Error('invalid_token');
  const want=createHmac('sha256',secret()).update(payload).digest();const got=Buffer.from(mac,'base64url');
  if(want.length!==got.length||!timingSafeEqual(want,got))throw new Error('invalid_token');
  const data=JSON.parse(Buffer.from(payload,'base64url').toString());
  if(data.v!==1||data.c!==CAMPAIGN||data.k!==kind||!/^[a-f0-9-]{36}$/.test(data.p)||!/^[a-f0-9]{64}$/.test(data.e))throw new Error('invalid_token');
  return data;
}
export async function tokenRow(token,kind){
  const data=verifyToken(token,kind);const row=await notion(`pages/${data.p}`);
  if(!inDatabase(row)||data.e!==hashEmail(emailOf(row)))throw new Error('invalid_token');
  return row;
}

export function scheduledTime(day,language){return `${day}T${language==='ko'?'01':'13'}:00:00.000Z`;}
const plusDay=day=>new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
// Only a never-attempted plan can move before its first provider submission.
// Existing provider IDs and ambiguous requests keep their original identity/time.
export function earlierUnattemptedSlot(state,slots,now,allowance){
  if(allowance<=0||state.attemptAt||state.phase!=='planned')return null;
  let day=now.toISOString().slice(0,10);if(day<START)day=START;
  while(day<=END&&((slots.get(day)||0)>=DAILY_LIMIT||Date.parse(scheduledTime(day,state.language))<=now.getTime()+3600000))day=plusDay(day);
  const at=day<=END?scheduledTime(day,state.language):null;
  return at&&Date.parse(at)<Date.parse(state.at)?at:null;
}
export function submissionAllowance(usage,submissionsToday){
  const remaining=(window,reserve)=>{
    if(!window||!Number.isFinite(window.used)||window.used<0)return 0;
    // Resend documents null as unlimited; missing limits fail closed.
    if(window.limit===null)return Infinity;
    return Number.isFinite(window.limit)&&window.limit>=0?window.limit-window.used-reserve:0;
  };
  return Math.max(0,Math.min(DAILY_LIMIT-submissionsToday,remaining(usage.emails?.daily,30),remaining(usage.emails?.monthly,100)));
}
export function pendingSchedule(rows){
  const result={};
  for(const row of rows){const s=readState(row);if(s.campaign!==CAMPAIGN||dateOf(row,P.sent)||dateOf(row,P.canceled)||textOf(row,P.failure))continue;
    const key=s.at;const item=result[key]??={language:s.language,providerScheduled:0,planned:0};item[textOf(row,P.id)?'providerScheduled':'planned']++;
  }
  return result;
}
export function planRows(rows,now=new Date(),suppressed=new Set()){
  const used=new Map(), seen=new Set(), excluded=new Map(), plans=[];
  // A duplicate's unsubscribe/hold suppresses the complete email identity.
  const blocked=new Set(rows.filter(r=>['Unsubscribed','Hold'].includes(r.properties?.Status?.select?.name)).map(emailOf));
  for(const r of rows){const s=readState(r);if(s.campaign===CAMPAIGN){seen.add(emailOf(r));if(s.at){const day=s.at.slice(0,10);used.set(day,(used.get(day)||0)+1);}}}
  const fresh=rows.filter(r=>!readState(r).campaign);
  const candidates=[];
  for(const row of fresh){
    const email=emailOf(row);const why=blocked.has(email)?'동일 이메일의 수신 거부 또는 보류':exclusion(row,suppressed);
    if(why){excluded.set(row.id,why);continue;}if(seen.has(email)){excluded.set(row.id,'동일 캠페인 중복 이메일');continue;}
    seen.add(email);candidates.push(row);
  }
  // Interleave KO/EN so a day's queue does not consume all slots for one language.
  const groups=['ko','en'].map(l=>candidates.filter(r=>languageFor(textOf(r,'Country'))===l));
  const ordered=[];while(groups.some(g=>g.length)){for(const g of groups){for(let i=0;i<3&&g.length;i++)ordered.push(g.shift());}}
  for(const row of ordered){
    const lang=languageFor(textOf(row,'Country'));let day=START;
    while(day<=END && ((used.get(day)||0)>=DAILY_LIMIT || Date.parse(scheduledTime(day,lang))<=now.getTime()+3600000))day=plusDay(day);
    if(day>END){excluded.set(row.id,'사전 공개 캠페인 종료');continue;}
    used.set(day,(used.get(day)||0)+1);
    plans.push({row,state:{campaign:CAMPAIGN,language:lang,at:scheduledTime(day,lang),emailHash:hashEmail(emailOf(row)),phase:'planned',template:'20261103-approved-v1'}});
  }
  return {plans,excluded};
}

export function renderMessage(row,state){
  if(state.campaign!==CAMPAIGN||!['ko','en'].includes(state.language)||state.emailHash!==hashEmail(emailOf(row)))throw new Error('campaign_identity_mismatch');
  const lang=state.language;
  const unsub=`${ORIGIN}/api/newsletter?action=unsubscribe&t=${tokenFor(row,'unsubscribe')}`;
  const open=`${ORIGIN}/api/newsletter?action=open&t=${tokenFor(row,'open')}`;
  let html=readFileSync(new URL(`../emails/watchdive-prelaunch/${lang}.html`,import.meta.url),'utf8').replaceAll('{{unsubscribe_url}}',unsub.replaceAll('&','&amp;'));
  const text=readFileSync(new URL(`../emails/watchdive-prelaunch/${lang}.txt`,import.meta.url),'utf8').replaceAll('{{unsubscribe_url}}',unsub);
  html=html.replace('</body>',`<img src="${open.replaceAll('&','&amp;')}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" /></body>`);
  return {from:'DIVEROID <help@diveroid.com>',reply_to:'help@diveroid.com',to:[emailOf(row)],subject:lang==='ko'?'(광고) [DIVEROID] WatchDive, 12월 킥스타터에서 만나요':'Meet WatchDive. Coming to Kickstarter this December.',html,text,scheduled_at:state.at,headers:{'List-Unsubscribe':`<${unsub}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},tags:[{name:'campaign',value:CAMPAIGN},{name:'notion_page',value:row.id},{name:'language',value:lang}]};
}

export class MailError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
export async function resend(path,{method='GET',body,key}={}){
  if(!process.env.NEWSLETTER_RESEND_API_KEY)throw new Error('missing_resend_key');
  let response;
  try {response=await fetch(`https://api.resend.com/${path}`,{method,signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.NEWSLETTER_RESEND_API_KEY}`,'Content-Type':'application/json','User-Agent':'diveroid-newsletter/1.0',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});}
  catch {throw new MailError(0,'provider_response_unknown');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new MailError(response.status,typeof data.name==='string'?data.name:'provider_error');
  return data;
}
export async function suppressedEmails(){
  const emails=new Set();let after;
  do{const r=await resend(`suppressions?limit=100${after?'&after='+encodeURIComponent(after):''}`);if(!Array.isArray(r.data))throw new Error('invalid_suppression_response');for(const x of r.data)emails.add(x.email.toLowerCase());after=r.has_more?r.data.at(-1)?.id:null;if(r.has_more&&!after)throw new Error('invalid_suppression_cursor');}while(after);
  return emails;
}
export async function cancelScheduled(row){
  const id=textOf(row,P.id);if(!id||dateOf(row,P.sent)||dateOf(row,P.canceled))return;
  try{await resend(`emails/${id}/cancel`,{method:'POST'});}
  catch(error){const mail=await resend(`emails/${id}`);if(mail.last_event!=='canceled')throw error;}
  await updatePage(row.id,{[P.canceled]:dateProp(new Date().toISOString())});
}
export async function unsubscribeRow(row){
  const rows=(await queryPages({property:'Email',title:{contains:emailOf(row)}})).filter(r=>emailOf(r)===emailOf(row));
  for(const r of rows){await updatePage(r.id,{Status:{select:{name:'Unsubscribed'}}});await cancelScheduled(r);}
}

export async function recordEvent(event){
  const tags=Array.isArray(event.data?.tags)?Object.fromEntries(event.data.tags.map(x=>[x.name,x.value])):event.data?.tags;
  if(tags?.campaign!==CAMPAIGN)return {ignored:true};
  if(!/^[a-f0-9-]{36}$/.test(tags.notion_page||''))throw new Error('bad_campaign_page');
  const row=await notion(`pages/${tags.notion_page}`),state=readState(row);
  if(!inDatabase(row)||state.campaign!==CAMPAIGN||state.emailHash!==hashEmail(emailOf(row)))return {ignored:true};
  if(!Array.isArray(event.data.to)||event.data.to.length!==1||event.data.to[0].toLowerCase()!==emailOf(row))throw new Error('event_recipient_mismatch');
  if(textOf(row,P.id)&&textOf(row,P.id)!==event.data.email_id)throw new Error('event_message_mismatch');
  if(!/^[a-f0-9-]{36}$/.test(event.data.email_id||''))throw new Error('bad_message_id');
  const at=new Date(event.created_at);if(!Number.isFinite(at.getTime()))throw new Error('invalid_event_time');
  const props={};
  if(!textOf(row,P.id))props[P.id]=richText(event.data.email_id);
  const type=event.type;
  if(['email.sent','email.delivered','email.opened','email.clicked','email.complained'].includes(type)&&!dateOf(row,P.sent))props[P.sent]=dateProp(at.toISOString());
  if(type==='email.delivered'&&!dateOf(row,P.delivered))props[P.delivered]=dateProp(at.toISOString());
  if(['email.bounced','email.failed','email.suppressed','email.complained'].includes(type))props[P.failure]=richText(type);
  if(['email.bounced','email.complained','email.suppressed'].includes(type))props.Status={select:{name:'Unsubscribed'}};
  if(Object.keys(props).length)await updatePage(row.id,props);
  return {recorded:!!Object.keys(props).length};
}

export function metrics(rows){
  const campaign=rows.filter(r=>readState(r).campaign===CAMPAIGN);
  const delivered=campaign.filter(r=>dateOf(r,P.delivered));const opened=delivered.filter(r=>dateOf(r,P.opened));
  return {total:campaign.length,scheduled:campaign.filter(r=>textOf(r,P.id)&&!dateOf(r,P.sent)&&!dateOf(r,P.canceled)&&!textOf(r,P.failure)).length,queued:campaign.filter(r=>!textOf(r,P.id)&&!dateOf(r,P.canceled)).length,sent:campaign.filter(r=>dateOf(r,P.sent)).length,delivered:delivered.length,uniqueOpened:opened.length,openRate:delivered.length?opened.length/delivered.length:null,failed:campaign.filter(r=>textOf(r,P.failure)).length,canceled:campaign.filter(r=>dateOf(r,P.canceled)).length,ko:campaign.filter(r=>readState(r).language==='ko').length,en:campaign.filter(r=>readState(r).language==='en').length};
}
