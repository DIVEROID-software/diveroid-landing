const {VERCEL_TOKEN,VERCEL_ORG_ID,VERCEL_PROJECT_ID}=process.env;
for(const key of ['NEWSLETTER_RESEND_API_KEY','NEWSLETTER_TOKEN_SECRET','NEWSLETTER_WEBHOOK_SECRET']){
  const value=process.env[key];if(!value)throw new Error(`Missing ${key}`);
  const url=new URL(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`);url.searchParams.set('teamId',VERCEL_ORG_ID);url.searchParams.set('upsert','true');
  const res=await fetch(url,{method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${VERCEL_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({key,value,type:'encrypted',target:['production']})});
  if(!res.ok)throw new Error(`Newsletter configuration failed (${res.status})`);
}
console.log('Production newsletter secrets configured.');
