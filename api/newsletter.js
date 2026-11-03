import { tokenRow, unsubscribeRow, P, dateOf, textOf } from '../lib/newsletter.mjs';
import { updatePage } from '../lib/subscriptions.mjs';
import { dateProp } from '../lib/newsletter.mjs';

const GIF=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
const page=(title,body)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · DIVEROID</title><body style="background:#f5f3ee;color:#111;font-family:Arial,'Apple SD Gothic Neo',sans-serif;max-width:560px;margin:80px auto;padding:24px;line-height:1.8"><b>DIVEROID</b><h1>${title}</h1>${body}</body></html>`;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private, max-age=0');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
  const url=new URL(req.url,'https://diveroid-landing.vercel.app'),action=url.searchParams.get('action'),token=url.searchParams.get('t');
  if(action==='open'){
    if(req.method==='HEAD')return res.status(200).end();
    if(req.method!=='GET')return res.status(405).end();
    try{const row=await tokenRow(token,'open');if(textOf(row,P.id)&&dateOf(row,P.plan)&&Date.now()>=Date.parse(dateOf(row,P.plan))&&!dateOf(row,P.opened)){await updatePage(row.id,{[P.opened]:dateProp(new Date().toISOString())});}}
    catch{ /* Invalid tokens and transient analytics failures never break the email image. */ }
    res.setHeader('Content-Type','image/gif');return res.status(200).send(GIF);
  }
  if(action!=='unsubscribe'||!['GET','POST'].includes(req.method))return res.status(400).send('Invalid request');
  try{
    const row=await tokenRow(token,'unsubscribe');res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.method==='GET')return res.status(200).send(page('Unsubscribe / 수신 거부','<p>Stop receiving DIVEROID news emails.<br>DIVEROID 소식 메일 수신을 중단합니다.</p><form method="post"><button name="confirm" value="1" style="background:#111;color:white;border:0;padding:16px 24px;font-size:16px;cursor:pointer">Unsubscribe / 수신 거부</button></form>'));
    const body=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body;
    if(body?.confirm!=='1'&&body?.['List-Unsubscribe']!=='One-Click')return res.status(400).send('Invalid request');
    await unsubscribeRow(row);
    return res.status(200).send(page('You’re unsubscribed. / 수신 거부 완료','<p>You will no longer receive DIVEROID news emails.<br>앞으로 DIVEROID 소식 메일을 보내드리지 않습니다.</p>'));
  }catch(e){const invalid=e.message==='invalid_token';return res.status(invalid?400:503).send(page(invalid?'Invalid link / 유효하지 않은 링크':'Please try again / 잠시 후 다시 시도해 주세요','<p>Contact / 문의: <a href="mailto:help@diveroid.com">help@diveroid.com</a></p>'));}
}
