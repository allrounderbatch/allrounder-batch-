const {getFirebaseAdmin,razorpayFetch,sendJson,verifyUser,verifyRazorpayPaymentSignature,findCatalogItem,grantPurchase}=require('../lib/shared');

module.exports = async (req,res) => {
  if(req.method!=='POST') return sendJson(res,405,{error:'Method not allowed'});
  try{
    const user=await verifyUser(req);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const orderId=String(body.orderId||body.razorpay_order_id||''),paymentId=String(body.paymentId||body.razorpay_payment_id||''),signature=String(body.signature||body.razorpay_signature||'');
    if(!orderId||!paymentId||!signature) return sendJson(res,400,{error:'Incomplete Razorpay payment details'});
    if(!verifyRazorpayPaymentSignature(orderId,paymentId,signature)) return sendJson(res,400,{error:'Invalid payment signature'});
    const db=getFirebaseAdmin().firestore();
    const savedSnap=await db.collection('orders').doc(orderId).get();
    if(!savedSnap.exists) return sendJson(res,404,{error:'Order not found'});
    const saved=savedSnap.data();
    if(saved.uid!==user.uid||saved.email!==user.email) return sendJson(res,403,{error:'Payment does not belong to this account'});
    const actualKind=saved.kind, actualItemId=saved.itemId;
    const item=await findCatalogItem(db,actualKind,actualItemId);
    const expected=Math.round(Number(item.price)*100);
    if(Number(saved.amount)!==expected||saved.currency!=='INR') return sendJson(res,400,{error:'Order amount or currency does not match'});
    const payment=await razorpayFetch(`/payments/${encodeURIComponent(paymentId)}`);
    if(payment.order_id!==orderId) return sendJson(res,403,{error:'Payment is linked to a different order'});
    if(Number(payment.amount)!==expected||payment.currency!=='INR') return sendJson(res,400,{error:'Payment amount or currency does not match'});
    if(payment.status!=='captured') return sendJson(res,402,{error:`Payment status is ${payment.status||'not captured'}. Please wait for confirmation.`});
    await grantPurchase({db,uid:user.uid,email:user.email,kind:actualKind,itemId:actualItemId,paymentId,orderId});
    return sendJson(res,200,{ok:true,status:'paid',paymentId});
  }catch(e){console.error(e);return sendJson(res,e.statusCode||500,{error:e.message||'Payment verification failed'});}
};
