const {getFirebaseAdmin,cashfreeFetch,sendJson,verifyUser,findCatalogItem,grantPurchase}=require('../lib/shared');

module.exports = async (req,res) => {
  if(req.method!=='POST') return sendJson(res,405,{error:'Method not allowed'});
  try{
    const user=await verifyUser(req);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const orderId=String(body.orderId||'');
    if(!orderId) return sendJson(res,400,{error:'Missing order id'});
    const db=getFirebaseAdmin().firestore();
    const savedSnap=await db.collection('orders').doc(orderId).get();
    if(!savedSnap.exists) return sendJson(res,404,{error:'Order not found'});
    const saved=savedSnap.data();
    if(saved.uid!==user.uid||saved.email!==user.email) return sendJson(res,403,{error:'Payment does not belong to this account'});
    const actualKind=saved.kind, actualItemId=saved.itemId;
    const item=await findCatalogItem(db,actualKind,actualItemId);
    const expected=Number(item.price);
    if(Number(saved.amount)!==expected||saved.currency!=='INR') return sendJson(res,400,{error:'Order amount or currency does not match'});

    // Always re-check the order status directly with Cashfree's server —
    // never trust anything the browser claims about payment success.
    const order=await cashfreeFetch(`/orders/${encodeURIComponent(orderId)}`);
    if(Number(order.order_amount)!==expected||order.order_currency!=='INR') return sendJson(res,400,{error:'Payment amount or currency does not match'});
    if(order.order_status!=='PAID') return sendJson(res,402,{error:`Payment status is ${order.order_status||'not paid'}. Please wait for confirmation.`});

    const payments=await cashfreeFetch(`/orders/${encodeURIComponent(orderId)}/payments`);
    const successfulPayment=(Array.isArray(payments)?payments:[]).find(p=>p.payment_status==='SUCCESS');
    const paymentId=successfulPayment?String(successfulPayment.cf_payment_id):orderId;

    await grantPurchase({db,uid:user.uid,email:user.email,kind:actualKind,itemId:actualItemId,paymentId,orderId});
    return sendJson(res,200,{ok:true,status:'paid',paymentId});
  }catch(e){console.error(e);return sendJson(res,e.statusCode||500,{error:e.message||'Payment verification failed'});}
};
