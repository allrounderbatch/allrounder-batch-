const {getFirebaseAdmin,sendJson,verifyUser}=require('../lib/shared');

module.exports = async (req,res) => {
  if(req.method!=='GET') return sendJson(res,405,{error:'Method not allowed'});
  try{
    const user=await verifyUser(req);
    const kind=req.query&&req.query.kind;
    const id=req.query&&req.query.id;
    if(!['batches','books'].includes(kind)||!id) return sendJson(res,400,{error:'Invalid item'});
    const a=getFirebaseAdmin(), db=a.firestore();
    const purchase=await db.collection('purchases').doc(user.email).get();
    if(!purchase.exists || !purchase.data().items || !purchase.data().items[id] || purchase.data().items[id].status!=='paid' || purchase.data().items[id].kind!==kind) return sendJson(res,403,{error:'Verified purchase required'});
    const privateDoc=await db.collection('privateCatalog').doc(`${kind}_${id}`).get();
    if(!privateDoc.exists) return sendJson(res,404,{error:'Access link not configured'});
    const data=privateDoc.data();
    return sendJson(res,200,{telegram:data.telegram||'',pdfUrl:data.pdfUrl||''});
  }catch(e){
    console.error(e);
    return sendJson(res,e.statusCode||500,{error:e.message||'Could not load access link'});
  }
};
