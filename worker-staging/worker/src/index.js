import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

const FIREBASE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const ALLOWED_ORIGINS = new Set([
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = { "Vary": "Origin", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS" };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
const json = (request, data, status=200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" } });
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
export function splitCommission(netCommissionCents) {
  if (!Number.isSafeInteger(netCommissionCents) || netCommissionCents < 1) {
    throw new TypeError("netCommissionCents must be a positive safe integer");
  }
  const userShareCents = Math.floor(netCommissionCents * 0.60);
  return {
    userShareCents,
    platformShareCents: netCommissionCents - userShareCents
  };
}
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
async function verifiedUser(request, env) {
  const token=request.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
  if(!token) throw Object.assign(new Error("Authentication required"),{status:401});
  const {payload}=await jwtVerify(token,FIREBASE_KEYS,{issuer:`https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,audience:env.FIREBASE_PROJECT_ID});
  return payload;
}
async function adminUser(request, env) {
  const payload=await verifiedUser(request,env);
  if(payload.admin!==true) throw Object.assign(new Error("Administrator permission required"),{status:403});
  const allowed=(env.ADMIN_UIDS||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(allowed.length && !allowed.includes(payload.sub)) throw Object.assign(new Error("UID is not in ADMIN_UIDS"),{status:403});
  return payload;
}
async function listCollection(env,name) {
  const all=[]; let pageToken="";
  do {
    const suffix=pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const d=await dbRequest(env,`${name}?pageSize=100${suffix}`);
    all.push(...(d.documents||[]).map(x=>({id:x.name.split("/").pop(),...decodeDoc(x)})));
    pageToken=d.nextPageToken||"";
  } while(pageToken);
  return all;
}
async function handle(request,env) {
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders(request)});
  const url=new URL(request.url);
  if(url.pathname==="/health") return json(request,{ok:true,service:"worldconnect-earn-api"});
  if(request.method==="GET" && url.pathname==="/api/withdrawals") {
    const user=await verifiedUser(request,env);
    const token=await googleAccessToken(env);
    const endpoint=`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
    const query={structuredQuery:{from:[{collectionId:"withdrawalRequests"}],where:{fieldFilter:{field:{fieldPath:"uid"},op:"EQUAL",value:{stringValue:user.sub}}},limit:50}};
    const r=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(query)});
    const rows=await r.json().catch(()=>[]);
    if(!r.ok) {
      const detail = rows?.error?.message || "Firestore query failed";
      console.error("STAGING WITHDRAWALS QUERY ERROR:", r.status, detail);
      return json(request,{error:"Could not load withdrawal history",details:detail},r.status);
    }
    const withdrawals=(rows||[]).filter(x=>x.document).map(x=>({id:x.document.name.split("/").pop(),...decodeDoc(x.document)}));
    withdrawals.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
    return json(request,{withdrawals});
  }
  if(request.method==="POST" && url.pathname==="/api/withdrawals") {
    const user=await verifiedUser(request,env);
    const x=await request.json();
    const amount=Number(x.amountCents), method=String(x.method||""), details=String(x.payoutDetails||"").trim();
    if(!Number.isSafeInteger(amount) || amount<1000 || amount>100000000 || !["bank","paypal"].includes(method) || details.length<5 || details.length>160) return json(request,{error:"Valid amount (minimum 10 EUR), payout method and details are required"},400);
    const walletPath=`wallets/${user.sub}`, walletDoc=await dbRequest(env,walletPath), wallet=decodeDoc(walletDoc);
    const available=Number(wallet.availableCents||0);
    if(available<amount) return json(request,{error:"Insufficient available balance"},409);
    const id=crypto.randomUUID(), now=new Date().toISOString();
    const base=`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    const token=await googleAccessToken(env);
    const writes=[
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/withdrawalRequests/${id}`,fields:fields({uid:user.sub,amountCents:amount,method,payoutDetails:details,status:"pending",createdAt:now})},currentDocument:{exists:false}},
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${walletPath}`,fields:fields({availableCents:available-amount,pendingWithdrawCents:Number(wallet.pendingWithdrawCents||0)+amount,updatedAt:now})},updateMask:{fieldPaths:["availableCents","pendingWithdrawCents","updatedAt"]},currentDocument:{updateTime:walletDoc.updateTime}}
    ];
    const commit=await fetch(`${base}:commit`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({writes})});
    if(!commit.ok) return json(request,{error:"Balance changed or request conflicted. Refresh and try again."},409);
    return json(request,{created:true,id,availableCents:available-amount},201);
  }
  const admin=await adminUser(request,env);
  if(request.method==="GET" && url.pathname==="/api/admin/summary") {
    const [offers,withdrawals,commissions,platformWithdrawals]=await Promise.all([listCollection(env,"affiliateOffers"),listCollection(env,"withdrawalRequests"),listCollection(env,"commissions"),listCollection(env,"platformWithdrawalRequests")]);
    let platformWallet={availableCents:0,pendingWithdrawCents:0,totalEarnedCents:0};
    try { platformWallet=decodeDoc(await dbRequest(env,"platformWallet/main")); } catch(e) { if(e.status!==404) throw e; }
    const financials=commissions.reduce((sum,c)=>({
      commissionCount:sum.commissionCount+1,
      netCommissionCents:sum.netCommissionCents+Number(c.netCommissionCents||0),
      userShareCents:sum.userShareCents+Number(c.userShareCents||0),
      platformShareCents:sum.platformShareCents+Number(c.platformShareCents||0)
    }),{commissionCount:0,netCommissionCents:0,userShareCents:0,platformShareCents:0});
    return json(request,{offers,withdrawals:withdrawals.filter(x=>x.status==="pending"),platformWithdrawals:platformWithdrawals.filter(x=>x.status==="pending"),platformWallet,financials});
  }
  if(request.method==="POST" && url.pathname==="/api/admin/offers") {
    const x=await request.json();
    const title=String(x.title||"").trim(), network=String(x.network||"").toLowerCase(), target=String(x.url||"");
    if(!title || !["admitad","awin","impact"].includes(network) || !/^https:\/\//i.test(target)) return json(request,{error:"Valid title, network and HTTPS URL required"},400);
    const id=crypto.randomUUID();
    await dbRequest(env,`affiliateOffers/${id}`,{method:"PATCH",body:JSON.stringify({fields:fields({title,description:String(x.description||"").slice(0,500),network,url:target,active:x.active===true && x.termsApproved===true,termsApproved:x.termsApproved===true,createdAt:new Date().toISOString(),createdBy:admin.sub})})});
    return json(request,{id,created:true},201);
  }
  if(request.method==="PATCH" && url.pathname.startsWith("/api/admin/offers/")) {
    const id=url.pathname.split("/").pop(); if(!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return json(request,{error:"Invalid offer id"},400);
    const x=await request.json();
    const offer=decodeDoc(await dbRequest(env,`affiliateOffers/${id}`));
    if(x.active===true && offer.termsApproved!==true) return json(request,{error:"Written incentive approval is required before activation"},403);
    await dbRequest(env,`affiliateOffers/${id}?updateMask.fieldPaths=active`,{method:"PATCH",body:JSON.stringify({fields:fields({active:x.active===true})})});
    return json(request,{updated:true});
  }
  if(request.method==="POST" && url.pathname==="/api/admin/commissions") {
    const x=await request.json(), uid=String(x.uid||""), externalId=String(x.externalId||"").trim();
    const net=Number(x.netCommissionCents);
    if(!uid || !externalId || !Number.isSafeInteger(net) || net<1 || net>100000000) return json(request,{error:"uid, externalId and positive netCommissionCents are required"},400);
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(externalId));
    const id=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
    const path=`commissions/${id}`;
    try { await dbRequest(env,path,{method:"GET"}); return json(request,{error:"This commission reference was already processed"},409); }
    catch(e) { if(e.status!==404) throw e; }
    const {userShareCents:share,platformShareCents:platform}=splitCommission(net), walletPath=`wallets/${uid}`, platformWalletPath="platformWallet/main";
    let walletDoc=null, wallet={availableCents:0,pendingCents:0,totalEarnedCents:0};
    try { walletDoc=await dbRequest(env,walletPath); wallet=decodeDoc(walletDoc); } catch(e) { if(e.status!==404) throw e; }
    let platformWalletDoc=null, platformWallet={availableCents:0,pendingWithdrawCents:0,totalEarnedCents:0};
    try { platformWalletDoc=await dbRequest(env,platformWalletPath); platformWallet=decodeDoc(platformWalletDoc); } catch(e) { if(e.status!==404) throw e; }
    const now=new Date().toISOString();
    const token=await googleAccessToken(env);
    const base=`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    const walletWrite = {
      update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${walletPath}`,fields:fields({availableCents:(wallet.availableCents||0)+share,pendingCents:wallet.pendingCents||0,totalEarnedCents:(wallet.totalEarnedCents||0)+share,updatedAt:now})},
      currentDocument: walletDoc ? {updateTime:walletDoc.updateTime} : {exists:false}
    };
    const platformWalletWrite = {
      update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${platformWalletPath}`,fields:fields({availableCents:Number(platformWallet.availableCents||0)+platform,pendingWithdrawCents:Number(platformWallet.pendingWithdrawCents||0),totalEarnedCents:Number(platformWallet.totalEarnedCents||0)+platform,updatedAt:now})},
      currentDocument: platformWalletDoc ? {updateTime:platformWalletDoc.updateTime} : {exists:false}
    };
    const writes=[
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`,fields:fields({uid,externalId,netCommissionCents:net,userShareCents:share,platformShareCents:platform,createdAt:now,createdBy:admin.sub})},currentDocument:{exists:false}},
      walletWrite,
      platformWalletWrite,
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/walletLedger/${id}`,fields:fields({uid,amountCents:share,type:"affiliate_commission",description:"Comisión de afiliación confirmada",externalId,createdAt:now})},currentDocument:{exists:false}},
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/platformLedger/${id}`,fields:fields({amountCents:platform,type:"affiliate_commission",description:"40 % de comisión de afiliación confirmada",externalId,commissionId:id,createdAt:now})},currentDocument:{exists:false}}
    ];
    const commit=await fetch(`${base}:commit`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({writes})});
    if(!commit.ok) { const er=await commit.json().catch(()=>({})); return json(request,{error:er.error?.message||"Commission could not be recorded safely"},409); }
    return json(request,{creditedCents:share,platformCents:platform},201);
  }
  if(request.method==="POST" && url.pathname==="/api/admin/platform-withdrawals") {
    const x=await request.json();
    const amount=Number(x.amountCents), method=String(x.method||""), details=String(x.payoutDetails||"").trim();
    if(!Number.isSafeInteger(amount) || amount<1000 || amount>100000000 || !["bank","paypal"].includes(method) || details.length<5 || details.length>160) return json(request,{error:"Valid amount (minimum 10 EUR), payout method and details are required"},400);
    const walletPath="platformWallet/main";
    let walletDoc;
    try { walletDoc=await dbRequest(env,walletPath); } catch(e) { if(e.status===404) return json(request,{error:"No platform balance is available yet"},409); throw e; }
    const wallet=decodeDoc(walletDoc), available=Number(wallet.availableCents||0);
    if(available<amount) return json(request,{error:"Insufficient available platform balance"},409);
    const id=crypto.randomUUID(), now=new Date().toISOString(), token=await googleAccessToken(env);
    const base=`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    const writes=[
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/platformWithdrawalRequests/${id}`,fields:fields({amountCents:amount,method,payoutDetails:details,status:"pending",createdAt:now,createdBy:admin.sub})},currentDocument:{exists:false}},
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${walletPath}`,fields:fields({availableCents:available-amount,pendingWithdrawCents:Number(wallet.pendingWithdrawCents||0)+amount,updatedAt:now})},updateMask:{fieldPaths:["availableCents","pendingWithdrawCents","updatedAt"]},currentDocument:{updateTime:walletDoc.updateTime}},
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/platformLedger/platform_withdrawal_request_${id}`,fields:fields({amountCents:-amount,type:"platform_withdrawal_requested",description:"Reserva para retirada de fondos de plataforma",withdrawalId:id,createdAt:now,createdBy:admin.sub})},currentDocument:{exists:false}}
    ];
    const commit=await fetch(`${base}:commit`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({writes})});
    if(!commit.ok) return json(request,{error:"Platform balance changed or request conflicted. Refresh and try again."},409);
    return json(request,{created:true,id,availableCents:available-amount},201);
  }
  if(request.method==="PATCH" && url.pathname.startsWith("/api/admin/platform-withdrawals/")) {
    const id=url.pathname.split("/").pop(), x=await request.json();
    if(!/^[A-Za-z0-9_-]{1,120}$/.test(id) || !["paid","rejected"].includes(x.status)) return json(request,{error:"Invalid request id or status"},400);
    const ref=`platformWithdrawalRequests/${id}`, w=await dbRequest(env,ref), current=decodeDoc(w);
    if(current.status!=="pending") return json(request,{error:"Platform withdrawal is no longer pending"},409);
    const walletPath="platformWallet/main", walletDoc=await dbRequest(env,walletPath), wallet=decodeDoc(walletDoc);
    const amount=Number(current.amountCents||0), pending=Number(wallet.pendingWithdrawCents||0);
    if(amount<1 || pending<amount) return json(request,{error:"Reserved platform balance is inconsistent; manual review required"},409);
    const now=new Date().toISOString(), token=await googleAccessToken(env), base=`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    const rejected=x.status==="rejected";
    const walletFields={pendingWithdrawCents:pending-amount,updatedAt:now};
    if(rejected) walletFields.availableCents=Number(wallet.availableCents||0)+amount;
    const ledgerId=`platform_withdrawal_review_${id}`;
    const writes=[
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${ref}`,fields:fields({status:x.status,reviewedAt:now,reviewedBy:admin.sub})},updateMask:{fieldPaths:["status","reviewedAt","reviewedBy"]},currentDocument:{updateTime:w.updateTime}},
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${walletPath}`,fields:fields(walletFields)},updateMask:{fieldPaths:Object.keys(walletFields)},currentDocument:{updateTime:walletDoc.updateTime}},
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/platformLedger/${ledgerId}`,fields:fields({amountCents:rejected?amount:0,type:rejected?"platform_withdrawal_refund":"platform_withdrawal_paid",description:rejected?"Reembolso de retirada de plataforma rechazada":"Retirada de plataforma pagada manualmente",withdrawalId:id,createdAt:now,createdBy:admin.sub})},currentDocument:{exists:false}}
    ];
    const commit=await fetch(`${base}:commit`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({writes})});
    if(!commit.ok) return json(request,{error:"Platform withdrawal review conflicted; refresh and retry"},409);
    return json(request,{updated:true,status:x.status});
  }
  if(request.method==="PATCH" && url.pathname.startsWith("/api/admin/withdrawals/")) {
    const id=url.pathname.split("/").pop(), x=await request.json();
    if(!/^[A-Za-z0-9_-]{1,120}$/.test(id) || !["paid","rejected"].includes(x.status)) return json(request,{error:"Invalid request id or status"},400);
    const ref=`withdrawalRequests/${id}`, w=await dbRequest(env,ref), current=decodeDoc(w);
    if(current.status!=="pending") return json(request,{error:"Request is no longer pending"},409);
    const walletPath=`wallets/${current.uid}`, walletDoc=await dbRequest(env,walletPath), wallet=decodeDoc(walletDoc);
    const amount=Number(current.amountCents||0), pending=Number(wallet.pendingWithdrawCents||0);
    if(amount<1 || pending<amount) return json(request,{error:"Reserved wallet balance is inconsistent; manual review required"},409);
    const now=new Date().toISOString(), token=await googleAccessToken(env);
    const base=`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    const walletFields={pendingWithdrawCents:pending-amount,updatedAt:now};
    const refunded=x.status==="rejected";
    if(refunded) walletFields.availableCents=Number(wallet.availableCents||0)+amount;
    const ledgerId=`withdrawal_${id}`;
    const ledgerEntry={
      uid:current.uid,
      amountCents:refunded?amount:-amount,
      type:refunded?"withdrawal_refund":"withdrawal_paid",
      description:refunded?"Reembolso de retirada rechazada":"Retirada pagada manualmente",
      withdrawalId:id,
      createdAt:now,
      createdBy:admin.sub
    };
    const writes=[
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${ref}`,fields:fields({status:x.status,reviewedAt:now,reviewedBy:admin.sub})},updateMask:{fieldPaths:["status","reviewedAt","reviewedBy"]},currentDocument:{updateTime:w.updateTime}},
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${walletPath}`,fields:fields(walletFields)},updateMask:{fieldPaths:Object.keys(walletFields)},currentDocument:{updateTime:walletDoc.updateTime}},
      {update:{name:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/walletLedger/${ledgerId}`,fields:fields(ledgerEntry)},currentDocument:{exists:false}}
    ];
    const commit=await fetch(`${base}:commit`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({writes})});
    if(!commit.ok) return json(request,{error:"Withdrawal review conflicted; refresh and retry"},409);
    return json(request,{updated:true,status:x.status});
  }
  return json(request,{error:"Not found"},404);
}
export default { async fetch(request,env) { try { return await handle(request,env); } catch(e) { return json(request,{error:e.message||"Internal error"},e.status||500); } } };
