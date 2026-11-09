import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {queryPages,updatePage,richText} from '../lib/subscriptions.mjs';
import {P} from '../lib/newsletter.mjs';
import {BATCH,handoffCandidates,handoffItem,encryptHandoff} from '../lib/gmail-handoff.mjs';
if(process.env.NEWSLETTER_ENABLED!=='false')throw Error('resend_marketing_must_be_paused');
const rows=await queryPages(undefined,100000),targets=handoffCandidates(rows),items=[];
for(const r of targets){
 const item=handoffItem(r);await updatePage(r.id,{[P.data]:richText(JSON.stringify(item.state)),[P.reason]:richText('Gmail 개별 발송 준비 — Resend 사용 중지')});items.push(item);
 await new Promise(r=>setTimeout(r,400));
}
mkdirSync('gmail-handoff',{recursive:true});
writeFileSync('gmail-handoff/batch.encrypted.json',JSON.stringify(encryptHandoff({batch:BATCH,preparedAt:new Date().toISOString(),items},readFileSync(new URL('./gmail-handoff-public.pem',import.meta.url),'utf8'))));
console.log(JSON.stringify({batch:BATCH,rows:rows.length,prepared:items.length,transport:'gmail',resendCalls:0,reoonCalls:0,customerSends:0,encrypted:true}));
