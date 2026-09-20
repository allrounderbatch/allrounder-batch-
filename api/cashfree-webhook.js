const {getFirebaseAdmin,cashfreeFetch,sendJson,verifyCashfreeWebhook,findCatalogItem,grantPurchase,getRawBody}=require('../lib/shared');

// Cashfree's webhook signature is computed over the exact raw request body,
// so automatic JSON body-parsing must be disabled for this endpoint.
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req,res) => {
  if(req.method!=='POST') return sendJson(res,405,{error:'Method not allowed'});
  try{
    const raw=await getRawBody(req);
    const headers=req.headers||{};
    const signature=headers['x-webhook-signature']||'';
    const timestamp=headers['x-webhook-timestamp']||'';
    if(!verifyCashfreeWebhook(raw,signature,timestamp)) return sendJson(res,400,{error:'Invalid webhook signature'});
    const payload=JSON.parse(raw); const eventType=payload.type||'';
    if(eventType!=='PAYMENT_SUCCESS_WEBHOOK') return sendJson(res,200,{ok:true,ignored:true});
    const orderData=payload.data?.order||{};
    const paymentData=payload.data?.payment||{};
    const orderId=String(orderData.order_id||'');
    const paymentId=String(paymentData.cf_payment_id||'');
    if(!orderId||!paymentId) return sendJson(res,200,{ok:true,ignored:true});

    const a=getFirebaseAdmin(),db=a.firestore();
    const savedSnap=await db.collection('orders').doc(orderId).get();
    if(!savedSnap.exists) return sendJson(res,200,{ok:true,ignored:true});
    const saved=savedSnap.data();
    const item=await findCatalogItem(db,saved.kind,saved.itemId);
    const expected=Number(item.price);
    if(Number(paymentData.payment_amount)!==expected||paymentData.payment_currency!=='INR') throw new Error('Payment amount/currency mismatch');
    if(paymentData.payment_status!=='SUCCESS') return sendJson(res,200,{ok:true,ignored:true});

    // Double-check with Cashfree's server directly before granting access.
    const verifiedOrder=await cashfreeFetch(`/orders/${encodeURIComponent(orderId)}`);
    if(verifiedOrder.order_status!=='PAID'||Number(verifiedOrder.order_amount)!==expected||verifiedOrder.order_currency!=='INR') throw new Error('Payment is not paid/valid');
    await grantPurchase({db,uid:saved.uid,email:saved.email,kind:saved.kind,itemId:saved.itemId,paymentId,orderId});
    const eventId=headers['x-webhook-id']||headers['x-idempotency-key']||`${eventType}_${paymentId}`;
    await db.collection('cashfreeWebhookEvents').doc(String(eventId)).set({receivedAt:Date.now(),processedAt:Date.now(),orderId,paymentId,event:eventType},{merge:true});
    return sendJson(res,200,{ok:true});
  }catch(e){console.error(e);return sendJson(res,e.statusCode||500,{error:e.message||'Webhook processing failed'});}
};
