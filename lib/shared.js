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

function getRazorpayConfig(){
  if(!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET){
    throw new Error('Razorpay Key ID/Key Secret are not configured');
  }
  return {keyId:process.env.RAZORPAY_KEY_ID,keySecret:process.env.RAZORPAY_KEY_SECRET};
}

async function razorpayFetch(path, options={}){
  const c=getRazorpayConfig();
  const auth=Buffer.from(`${c.keyId}:${c.keySecret}`).toString('base64');
  const headers={accept:'application/json','content-type':'application/json',authorization:`Basic ${auth}`,...(options.headers||{})};
  const res=await fetch(`https://api.razorpay.com/v1${path}`,{...options,headers});
  const text=await res.text();
  let data={}; try{data=text?JSON.parse(text):{};}catch{data={raw:text};}
  if(!res.ok){
    const msg=data.error?.description||data.error?.reason||data.message||`Razorpay API error (${res.status})`;
    throw Object.assign(new Error(msg),{statusCode:res.status,details:data});
  }
  return data;
}

function verifyRazorpayPaymentSignature(orderId,paymentId,signature){
  const secret=process.env.RAZORPAY_KEY_SECRET||'';
  if(!orderId||!paymentId||!signature||!secret) return false;
  const expected=crypto.createHmac('sha256',secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a=Buffer.from(signature); const b=Buffer.from(expected);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

function verifyRazorpayWebhook(rawBody,signature){
  const secret=process.env.RAZORPAY_WEBHOOK_SECRET||'';
  if(!rawBody||!signature||!secret) return false;
  const expected=crypto.createHmac('sha256',secret).update(rawBody).digest('hex');
  const a=Buffer.from(signature); const b=Buffer.from(expected);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
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
    tx.set(db.collection('orders').doc(orderId),{uid,email,kind,itemId,paymentId,status:'paid',paidAt:Date.now(),gateway:'razorpay'},{merge:true});
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

module.exports={getFirebaseAdmin,getRazorpayConfig,razorpayFetch,verifyRazorpayPaymentSignature,verifyRazorpayWebhook,sendJson,getBearer,verifyUser,findCatalogItem,grantPurchase,getRawBody};
