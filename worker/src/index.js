import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

const FIREBASE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS" };
const json = (data, status=200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const enc = (s) => new TextEncoder().encode(s);
function firestoreValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === "number") return { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(firestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k,x])=>[k,firestoreValue(x)])) } };
}
function fromFirestore(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,fromFirestore(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values||[]).map(fromFirestore);
  if ("timestampValue" in v) return v.timestampValue;
  return null;
}
function decodeDoc(d) { return Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,fromFirestore(v)])); }
function fields(obj) { return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,firestoreValue(v)])); }
async function googleAccessToken(env) {
  const now = Math.floor(Date.now()/1000);
  const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,"\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  const der = Uint8Array.from(atob(pem), c=>c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8",der,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const assertion = await new SignJWT({scope:"https://www.googleapis.com/auth/datastore"})
    .setProtectedHeader({alg:"RS256",typ:"JWT"}).setIssuer(env.GOOGLE_CLIENT_EMAIL)
    .setSubject(env.GOOGLE_CLIENT_EMAIL).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now).setExpirationTime(now+3600).sign(key);
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  if(!r.ok) throw new Error("Google service-account authentication failed");
  return (await r.json()).access_token;
}
async function dbRequest(env, path, options={}) {
  const token=await googleAccessToken(env);
  const r=await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`,{...options,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(options.headers||{})}});
  const body=await r.json().catch(()=>({}));
  if(!r.ok) { const e=new Error(body.error?.message||"Firestore request failed"); e.status=r.status; throw e; }
  return body;
}
async function adminUser(request, env) {
  const token=request.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
  if(!token) throw Object.assign(new Error("Authentication required"),{status:401});
  const {payload}=await jwtVerify(token,FIREBASE_KEYS,{issuer:`https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,audience:env.FIREBASE_PROJECT_ID});
  if(payload.admin!==true) throw Object.assign(new Error("Administrator permission required"),{status:403});
  const allowed=(env.ADMIN_UIDS||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(allowed.length && !allowed.includes(payload.sub)) throw Object.assign(new Error("UID is not in ADMIN_UIDS"),{status:403});
  return payload;
}
async function listCollection(env,name) {
  const d=await dbRequest(env,`${name}?pageSize=100`);
  return (d.documents||[]).map(x=>({id:x.name.split("/").pop(),...decodeDoc(x)}));
}
async function handle(request,env) {
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
  const url=new URL(request.url);
  if(url.pathname==="/health") return json({ok:true,service:"worldconnect-earn-api"});
  const admin=await adminUser(request,env);
  if(request.method==="GET" && url.pathname==="/api/admin/summary") {
    const [offers,withdrawals]=await Promise.all([listCollection(env,"affiliateOffers"),listCollection(env,"withdrawalRequests")]);
    return json({offers,withdrawals:withdrawals.filter(x=>x.status==="pending")});
  }
  if(request.method==="POST" && url.pathname==="/api/admin/offers") {
    const x=await request.json();
    const title=String(x.title||"").trim(), network=String(x.network||"").toLowerCase(), target=String(x.url||"");
    if(!title || !["admitad","awin","impact"].includes(network) || !/^https:\/\//i.test(target)) return json({error:"Valid title, network and HTTPS URL required"},400);
    const id=crypto.randomUUID();
    await dbRequest(env,`affiliateOffers/${id}`,{method:"PATCH",body:JSON.stringify({fields:fields({title,description:String(x.description||"").slice(0,500),network,url:target,active:x.active===true,termsApproved:x.termsApproved===true,createdAt:new Date().toISOString(),createdBy:admin.sub})})});
    return json({id,created:true},201);
  }
  if(request.method==="PATCH" && url.pathname.startsWith("/api/admin/offers/")) {
    const id=url.pathname.split("/").pop(); if(!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return json({error:"Invalid offer id"},400);
    const x=await request.json(); const allowed={active: x.active===true};
    await dbRequest(env,`affiliateOffers/${id}?updateMask.fieldPaths=active`,{method:"PATCH",body:JSON.stringify({fields:fields(allowed)})});
    return json({updated:true});
  }
  if(request.method==="POST" && url.pathname==="/api/admin/commissions") {
    const x=await request.json(), uid=String(x.uid||""), externalId=String(x.externalId||"").trim();
    const net=Number(x.netCommissionCents);
    if(!uid || !externalId || !Number.isSafeInteger(net) || net<1 || net>100000000) return json({error:"uid, externalId and positive netCommissionCents are required"},400);
    const id=btoa(externalId).replace(/[^A-Za-z0-9_-]/g,"").slice(0,100);
    const path=`commissions/${id}`;
    try { await dbRequest(env,path,{method:"GET"}); return json({error:"This commission reference was already processed"},409); }
    catch(e) { if(e.status!==404) throw e; }
    const share=Math.floor(net*0.60), platform=net-share, walletPath=`wallets/${uid}`;
    let wallet={availableCents:0,pendingCents:0,totalEarnedCents:0};
    try { wallet=decodeDoc(await dbRequest(env,walletPath)); } catch(e) { if(e.status!==404) throw e; }
    const now=new Date().toISOString();
    const token=await googleAccessToken(env);
    const base=`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    const writes=[
      {update:{name:`${base}/${path}`,fields:fields({uid,externalId,netCommissionCents:net,userShareCents:share,platformShareCents:platform,createdAt:now,createdBy:admin.sub})},currentDocument:{exists:false}},
      {update:{name:`${base}/${walletPath}`,fields:fields({availableCents:(wallet.availableCents||0)+share,pendingCents:wallet.pendingCents||0,totalEarnedCents:(wallet.totalEarnedCents||0)+share,updatedAt:now})}},
      {update:{name:`${base}/walletLedger/${id}`,fields:fields({uid,amountCents:share,type:"affiliate_commission",description:"Comisión de afiliación confirmada",externalId,createdAt:now})},currentDocument:{exists:false}}
    ];
    const commit=await fetch(`${base}:commit`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({writes})});
    if(!commit.ok) { const er=await commit.json().catch(()=>({})); return json({error:er.error?.message||"Commission could not be recorded safely"},409); }
    return json({creditedCents:share,platformCents:platform},201);
  }
  if(request.method==="PATCH" && url.pathname.startsWith("/api/admin/withdrawals/")) {
    const uid=url.pathname.split("/").pop(), x=await request.json();
    if(!["paid","rejected"].includes(x.status)) return json({error:"Status must be paid or rejected"},400);
    const ref=`withdrawalRequests/${uid}`;
    const w=await dbRequest(env,ref);
    const current=decodeDoc(w);
    if(current.status!=="pending") return json({error:"Request is no longer pending"},409);
    if(x.status==="paid") {
      const wallet=decodeDoc(await dbRequest(env,`wallets/${uid}`));
      if((wallet.availableCents||0)<current.amountCents) return json({error:"Insufficient wallet balance"},409);
      await dbRequest(env,`wallets/${uid}?updateMask.fieldPaths=availableCents&updateMask.fieldPaths=updatedAt`,{method:"PATCH",body:JSON.stringify({fields:fields({availableCents:wallet.availableCents-current.amountCents,updatedAt:new Date().toISOString()})})});
    }
    await dbRequest(env,`${ref}?updateMask.fieldPaths=status&updateMask.fieldPaths=reviewedAt&updateMask.fieldPaths=reviewedBy`,{method:"PATCH",body:JSON.stringify({fields:fields({status:x.status,reviewedAt:new Date().toISOString(),reviewedBy:admin.sub})})});
    return json({updated:true,status:x.status});
  }
  return json({error:"Not found"},404);
}
export default { async fetch(request,env) { try { return await handle(request,env); } catch(e) { return json({error:e.message||"Internal error"},e.status||500); } } };
