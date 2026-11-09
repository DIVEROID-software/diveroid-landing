import {queryPages,notion,updatePage} from '../lib/subscriptions.mjs';
import {resend,suppressedEmails,recordEvent} from '../lib/newsletter.mjs';
import {runDaily} from '../lib/newsletter-daily.mjs';
const apply=process.argv.includes('--apply');
if(apply&&process.env.NEWSLETTER_ENABLED!=='true')throw Error('newsletter_disabled');
let nextProviderAt=0;
const pacedResend=async(...args)=>{
  const wait=Math.max(0,nextProviderAt-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));
  nextProviderAt=Date.now()+650;return resend(...args);
};
try{
  const result=await runDaily({queryPages:()=>queryPages(undefined,100000),getRow:id=>notion('pages/'+id),updatePage,resend:pacedResend,suppressedEmails,recordEvent,sleep:()=>new Promise(r=>setTimeout(r,400))},{apply});
  console.log(JSON.stringify(result));if(result.failures)process.exitCode=1;
}catch(error){console.log(JSON.stringify({mode:apply?'daily-apply':'daily-dry-run',fatal:true,code:error.code||error.status||'operation_failed'}));process.exitCode=1;}
