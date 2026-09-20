const {getFirebaseAdmin,cashfreeFetch,sendJson,verifyUser,findCatalogItem,getSiteUrl}=require('../lib/shared');
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

    const amount=Number(item.price);
    if(!Number.isFinite(amount)||amount<1) return sendJson(res,400,{error:'Item price must be at least ₹1.00'});

    // Cashfree requires a customer phone number; fall back to a placeholder
    // if the user never filled in the optional mobile field on signup.
    const profileSnap=await db.collection('users').doc(user.uid).get();
    const profile=profileSnap.exists?profileSnap.data():{};
    const digitsOnly=String(profile.mobile||'').replace(/\D/g,'');
    const phone=digitsOnly.length>=10?digitsOnly.slice(-10):'9999999999';

    const orderId=`acb_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`.slice(0,45);
    const order=await cashfreeFetch('/orders',{method:'POST',body:JSON.stringify({
      order_id:orderId,
      order_amount:amount,
      order_currency:'INR',
      customer_details:{
        customer_id:user.uid,
        customer_email:user.email,
        customer_phone:phone
      },
      order_meta:{
        return_url:`${getSiteUrl(req)}/?cf_order_id={order_id}`
      },
      order_note:`${kind}:${id}`
    })});

    await db.collection('orders').doc(orderId).set({uid:user.uid,email:user.email,kind,itemId:id,amount,currency:'INR',status:order.order_status||'ACTIVE',gateway:'cashfree',createdAt:Date.now()},{merge:true});
    return sendJson(res,200,{orderId,paymentSessionId:order.payment_session_id,amount,currency:'INR',env:(process.env.CASHFREE_ENV||'PRODUCTION').toUpperCase(),name:item.title,description:item.sub||''});
  }catch(e){console.error(e);return sendJson(res,e.statusCode||500,{error:e.message||'Could not create Cashfree order'});}
};
