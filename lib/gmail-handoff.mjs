import {randomBytes,createCipheriv,publicEncrypt,constants} from 'node:crypto';
import {emailOf} from './subscriptions.mjs';
import {P,readState,textOf,dateOf,CAMPAIGN,hashEmail} from './newsletter.mjs';
import {selectDaily,dailyExclusion,dailyLanguage,renderDaily,TEMPLATE} from './newsletter-daily.mjs';
export const BATCH='wd-gmail-remainder-20261109';
const CUTOFF=Date.parse('2026-11-09T06:32:58Z');
export function handoffCandidates(rows){
 const fresh=selectDaily(rows).candidates.filter(r=>Date.parse(r.created_time)<=CUTOFF&&textOf(r,P.reason)==='발송 한도 대기 — 다음 일일 점검에서 재확인');
 const resumed=rows.filter(r=>{const s=readState(r);return s.gmailBatchId===BATCH&&s.phase==='manual_review'&&s.emailHash===hashEmail(emailOf(r))&&!s.attemptAt&&!textOf(r,P.id)&&!dateOf(r,P.sent)&&!dateOf(r,P.delivered)&&!dateOf(r,P.canceled)&&!textOf(r,P.failure)&&!dailyExclusion(r)});
 const out=[...new Map([...fresh,...resumed].map(r=>[r.id,r])).values()];
 const optedOut=new Set(rows.filter(r=>r.properties?.Status?.select?.name==='Unsubscribed').map(emailOf));
 const selected=out.filter(r=>!r.archived&&!r.in_trash&&!optedOut.has(emailOf(r)));
 if(selected.length>202)throw Error('gmail_batch_exceeds_authorized_snapshot');
 return selected;
}
export function handoffItem(row,now=new Date()){
 const old=readState(row),route=dailyLanguage(row);
 const state={...old,campaign:CAMPAIGN,phase:'manual_review',transport:'gmail',gmailBatchId:BATCH,handoffPreparedAt:now.toISOString(),template:TEMPLATE,language:route.language,languageBasis:route.basis,emailHash:hashEmail(emailOf(row)),at:now.toISOString()};
 const message=renderDaily(row,state);
 return {pageId:row.id,email:emailOf(row),state,message};
}
export function encryptHandoff(value,publicKey){
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return {v:1,algorithm:'RSA-OAEP-SHA256+AES-256-GCM',key:publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
