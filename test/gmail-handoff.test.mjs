import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,privateDecrypt,createDecipheriv,constants} from 'node:crypto';
import {DATABASE_ID,richText} from '../lib/subscriptions.mjs';
import {P,hashEmail} from '../lib/newsletter.mjs';
import {ONE_OFF} from '../lib/newsletter-daily.mjs';
import {BATCH,handoffCandidates,handoffItem,encryptHandoff} from '../lib/gmail-handoff.mjs';
process.env.NEWSLETTER_TOKEN_SECRET='isolated-gmail-test-only-secret-123456789';
function row(n=1){return {id:`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,created_time:'2026-11-08T00:00:00Z',parent:{database_id:DATABASE_ID},properties:{Email:{title:[{text:{content:`reader${n}@example.com`}}]},Status:{select:{name:'New'}},'Reoon Status':{select:{name:'error'}},[P.reason]:richText('발송 한도 대기 — 다음 일일 점검에서 재확인'),[P.data]:richText(JSON.stringify({oneOffAuthorization:{id:ONE_OFF,emailHash:hashEmail(`reader${n}@example.com`)}}))}}}
test('snapshot handoff excludes sent, later, unsubscribed duplicate and ambiguous attempts',()=>{
 const a=row(1),b=row(2),c=row(3),d=row(4),e=row(5),f=row(6),g=row(7);
 b.properties[P.sent]={date:{start:'2026-11-09T00:00:00Z'}};c.created_time='2026-11-09T07:00:00Z';
 d.properties.Status.select.name='Unsubscribed';e.properties.Email=d.properties.Email;
 f.properties[P.data]=richText(JSON.stringify({attemptAt:'2026-11-09T00:00:00Z'}));g.properties[P.reason]=richText('발송 서비스 수신 차단');
 assert.deepEqual(handoffCandidates([a,b,c,d,e,f,g]).map(r=>r.id),[a.id]);
});
test('handoff preserves signed unsubscribe, official sender and prior grant and can safely resume preparation',()=>{
 const r=row(),item=handoffItem(r);assert.equal(item.message.from,'DIVEROID <help@diveroid.com>');assert.ok(item.message.html.includes('action=unsubscribe'));assert.equal(item.message.scheduled_at,undefined);assert.equal(item.state.oneOffAuthorization.id,ONE_OFF);
 r.properties[P.data]=richText(JSON.stringify(item.state));r.properties[P.reason]=richText('Gmail 개별 발송 준비 — Resend 사용 중지');assert.equal(handoffCandidates([r]).length,1);
});
test('export is authenticated encryption and contains no readable recipient or unsubscribe token',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048}),value={batch:BATCH,items:[{email:'private@example.com',url:'secret-signed-unsubscribe'}]};
 const env=encryptHandoff(value,publicKey);assert.ok(!JSON.stringify(env).includes('private@example.com'));const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(env.key,'base64'));
 const d=createDecipheriv('aes-256-gcm',key,Buffer.from(env.iv,'base64'));d.setAuthTag(Buffer.from(env.tag,'base64'));assert.deepEqual(JSON.parse(Buffer.concat([d.update(Buffer.from(env.data,'base64')),d.final()]).toString()),value);
});
