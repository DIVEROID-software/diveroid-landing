import { Webhook } from 'svix';
import { recordEvent } from '../lib/newsletter.mjs';
export const config={api:{bodyParser:false}};
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  if(!process.env.NEWSLETTER_WEBHOOK_SECRET)return res.status(503).end();
  let event;
  try{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>262144)return res.status(413).end();chunks.push(Buffer.from(chunk));}
    const raw=Buffer.concat(chunks).toString('utf8');
    new Webhook(process.env.NEWSLETTER_WEBHOOK_SECRET).verify(raw,{'svix-id':req.headers['svix-id'],'svix-timestamp':req.headers['svix-timestamp'],'svix-signature':req.headers['svix-signature']});
    event=JSON.parse(raw);
  }catch{return res.status(400).json({error:'invalid_signature'});}
  try{await recordEvent(event);return res.status(200).json({ok:true});}
  catch{return res.status(503).json({error:'recording_failed'});}
}
