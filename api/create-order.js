const {getFirebaseAdmin,razorpayFetch,sendJson,verifyUser,findCatalogItem}=require('../lib/shared');
const crypto=require('crypto');

module.exports = async (req,res) => {
  if(req.method!=='POST') return sendJson(res,405,{error:'Method not allowed'});
  try{
    const user=await verifyUser(req);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const kind=body.kind,id=body.id;
    if(!['batches','books'].includes(kind)||!id) return sendJson(res,400,{error:'Invalid item'});
    const a=getFirebaseAdmin(),db=a.firestore(),item=await findCatalogItem(db,kind,id);
    const existing=await db.collection('purchases').doc(user.email).get();
    if(existing.exists&&existing.data().items?.[id]?.status==='paid') return sendJson(res,409,{error:'Already purchased'});

    const amount=Math.round(Number(item.price)*100);
    if(!Number.isInteger(amount)||amount<100) return sendJson(res,400,{error:'Item price must be at least ₹1.00'});
    const receipt=`acb_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`.slice(0,40);
    const order=await razorpayFetch('/orders',{method:'POST',body:JSON.stringify({amount,currency:'INR',receipt,notes:{uid:user.uid,email:user.email,kind,itemId:id}})});
    await db.collection('orders').doc(order.id).set({uid:user.uid,email:user.email,kind,itemId:id,amount,currency:'INR',status:order.status||'created',gateway:'razorpay',createdAt:Date.now()},{merge:true});
    return sendJson(res,200,{orderId:order.id,keyId:process.env.RAZORPAY_KEY_ID,amount,currency:'INR',name:item.title,description:item.sub||''});
  }catch(e){console.error(e);return sendJson(res,e.statusCode||500,{error:e.message||'Could not create Razorpay order'});}
};
