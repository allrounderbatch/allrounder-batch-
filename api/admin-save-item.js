const {getFirebaseAdmin,sendJson,verifyUser}=require('../lib/shared');

const DEFAULT_ADMIN_EMAIL='ggr20161@gmail.com';

module.exports = async (req,res) => {
  if(req.method!=='POST') return sendJson(res,405,{error:'Method not allowed'});
  try{
    const user=await verifyUser(req);
    const adminEmail=(process.env.ADMIN_EMAIL||DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
    if(!user.email || user.email.trim().toLowerCase()!==adminEmail){
      return sendJson(res,403,{error:'Admin account required'});
    }
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const {kind,id,title,tag,sub,price,mrp,telegram,pdfUrl=''}=body;
    if(!['batches','books'].includes(kind)||!id) return sendJson(res,400,{error:'Invalid item'});
    if(telegram && !/^https?:\/\/t\.me\//i.test(String(telegram).trim())) return sendJson(res,400,{error:'Telegram link should start with https://t.me/'});
    const numericPrice=Math.max(0,Number(price)||0), numericMrp=Math.max(0,Number(mrp)||0);
    const a=getFirebaseAdmin(),db=a.firestore();
    const catalogRef=db.collection('catalog').doc(kind);
    const snap=await catalogRef.get();
    if(!snap.exists) return sendJson(res,404,{error:'Catalog not found'});
    const items=Array.isArray(snap.data().items)?snap.data().items:[];
    const idx=items.findIndex(x=>x.id===id);
    if(idx<0) return sendJson(res,404,{error:'Item not found'});
    const old=items[idx]||{};
    items[idx]={...old,id,title:String(title||''),tag:String(tag||''),sub:String(sub||''),price:numericPrice,mrp:numericMrp};
    await catalogRef.set({items},{merge:true});
    await db.collection('privateCatalog').doc(`${kind}_${id}`).set({
      kind,id,telegram:String(telegram||'').trim(),pdfUrl:String(pdfUrl||'').trim(),updatedAt:Date.now()
    },{merge:true});
    return sendJson(res,200,{ok:true,savedAt:Date.now()});
  }catch(e){
    console.error(e);
    return sendJson(res,e.statusCode||500,{error:e.message||'Could not save item'});
  }
};
