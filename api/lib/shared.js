const admin = require('firebase-admin');
const crypto = require('crypto');

function getFirebaseAdmin(){
  if(!admin.apps.length){
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if(!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
    admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw))});
  }
  return admin;
}

function getCashfreeConfig(){
  if(!process.env.CASHFREE_APP_ID || !process.env.CASHFREE_SECRET_KEY){
    throw new Error('Cashfree App ID/Secret Key are not configured');
  }
  const env=(process.env.CASHFREE_ENV||'PRODUCTION').toUpperCase();
  const baseUrl = env==='TEST' ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg';
  return {appId:process.env.CASHFREE_APP_ID, secretKey:process.env.CASHFREE_SECRET_KEY, env, baseUrl};
}

async function cashfreeFetch(path, options={}){
  const c=getCashfreeConfig();
  const headers={
    accept:'application/json',
    'content-type':'application/json',
    'x-client-id':c.appId,
    'x-client-secret':c.secretKey,
    'x-api-version':'2023-08-01',
    ...(options.headers||{})
  };
  const res=await fetch(`${c.baseUrl}${path}`,{...options,headers});
  const text=await res.text();
  let data={}; try{data=text?JSON.parse(text):{};}catch{data={raw:text};}
  if(!res.ok){
    const msg=data.message||data.error_description||`Cashfree API error (${res.status})`;
    throw Object.assign(new Error(msg),{statusCode:res.status,details:data});
  }
  return data;
}

// Cashfree webhook signatures are verified as HMAC-SHA256(timestamp + rawBody)
// using your secret key, base64 encoded. See Cashfree's webhook signature docs.
function verifyCashfreeWebhook(rawBody,signature,timestamp){
  const secret=process.env.CASHFREE_WEBHOOK_SECRET||process.env.CASHFREE_SECRET_KEY||'';
  if(!rawBody||!signature||!timestamp||!secret) return false;
  const expected=crypto.createHmac('sha256',secret).update(timestamp+rawBody).digest('base64');
  try{
    const a=Buffer.from(signature); const b=Buffer.from(expected);
    return a.length===b.length && crypto.timingSafeEqual(a,b);
  }catch{ return false; }
}

function sendJson(res, statusCode, body){
  res.status(statusCode).setHeader('Cache-Control','no-store').json(body);
}

function getBearer(req){
  const h=req.headers||{};
  const auth=h.authorization||h.Authorization||'';
  return auth.startsWith('Bearer ')?auth.slice(7):'';
}

async function verifyUser(req){
  const token=getBearer(req);
  if(!token) throw Object.assign(new Error('Authentication required'),{statusCode:401});
  return await getFirebaseAdmin().auth().verifyIdToken(token);
}

async function findCatalogItem(db,kind,id){
  if(!['batches','books'].includes(kind)) throw new Error('Invalid item type');
  const snap=await db.collection('catalog').doc(kind).get();
  if(!snap.exists) throw new Error('Catalog not found');
  const item=(snap.data().items||[]).find(x=>x.id===id);
  if(!item) throw new Error('Item not found');
  const price=Number(item.price); if(!Number.isFinite(price)||price<=0) throw new Error('Invalid item price');
  return item;
}

async function grantPurchase({db,uid,email,kind,itemId,paymentId,orderId}){
  const ref=db.collection('purchases').doc(email);
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref); const items=snap.exists?(snap.data().items||{}):{};
    items[itemId]={...(items[itemId]||{}),kind,at:items[itemId]?.at||Date.now(),email,uid,paymentId,orderId,status:'paid',accessUsed:items[itemId]?.accessUsed||false};
    tx.set(ref,{items,updatedAt:Date.now()},{merge:true});
    tx.set(db.collection('orders').doc(orderId),{uid,email,kind,itemId,paymentId,status:'paid',paidAt:Date.now(),gateway:'cashfree'},{merge:true});
  });
}

function getRawBody(req){
  return new Promise((resolve,reject)=>{
    let data='';
    req.on('data',chunk=>{data+=chunk;});
    req.on('end',()=>resolve(data));
    req.on('error',reject);
  });
}

function getSiteUrl(req){
  const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host;
  return `${proto}://${host}`;
}

module.exports={getFirebaseAdmin,getCashfreeConfig,cashfreeFetch,verifyCashfreeWebhook,sendJson,getBearer,verifyUser,findCatalogItem,grantPurchase,getRawBody,getSiteUrl};
