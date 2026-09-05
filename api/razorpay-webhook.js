const {getFirebaseAdmin,razorpayFetch,sendJson,verifyRazorpayWebhook,findCatalogItem,grantPurchase,getRawBody}=require('../lib/shared');

// Razorpay's webhook signature is computed over the exact raw request body,
// so automatic JSON body-parsing must be disabled for this endpoint.
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req,res) => {
  if(req.method!=='POST') return sendJson(res,405,{error:'Method not allowed'});
  try{
    const raw=await getRawBody(req);
    const headers=req.headers||{};
    const signature=headers['x-razorpay-signature']||'';
    if(!verifyRazorpayWebhook(raw,signature)) return sendJson(res,400,{error:'Invalid webhook signature'});
    const payload=JSON.parse(raw); const eventName=payload.event||'';
    if(eventName!=='payment.captured'&&eventName!=='order.paid') return sendJson(res,200,{ok:true,ignored:true});
    const payment=payload.payload?.payment?.entity||{};
    const order=payload.payload?.order?.entity||{};
    const orderId=String(payment.order_id||order.id||'');
    const paymentId=String(payment.id||'');
    if(!orderId||!paymentId) return sendJson(res,200,{ok:true,ignored:true});

    const a=getFirebaseAdmin(),db=a.firestore();
    const savedSnap=await db.collection('orders').doc(orderId).get();
    if(!savedSnap.exists) return sendJson(res,200,{ok:true,ignored:true});
    const saved=savedSnap.data();
    const item=await findCatalogItem(db,saved.kind,saved.itemId);
    const expected=Math.round(Number(item.price)*100);
    if(Number(payment.amount)!==expected||payment.currency!=='INR') throw new Error('Payment amount/currency mismatch');
    if(eventName==='payment.captured' && payment.status!=='captured') return sendJson(res,200,{ok:true,ignored:true});

    const verified=await razorpayFetch(`/payments/${encodeURIComponent(paymentId)}`);
    if(verified.order_id!==orderId||verified.status!=='captured'||Number(verified.amount)!==expected||verified.currency!=='INR') throw new Error('Payment is not captured/valid');
    await grantPurchase({db,uid:saved.uid,email:saved.email,kind:saved.kind,itemId:saved.itemId,paymentId,orderId});
    const eventId=headers['x-razorpay-event-id']||`${eventName}_${paymentId}`;
    await db.collection('razorpayWebhookEvents').doc(String(eventId)).set({receivedAt:Date.now(),processedAt:Date.now(),orderId,paymentId,event:eventName},{merge:true});
    return sendJson(res,200,{ok:true});
  }catch(e){console.error(e);return sendJson(res,e.statusCode||500,{error:e.message||'Webhook processing failed'});}
};
