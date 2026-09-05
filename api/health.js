const {sendJson}=require('../lib/shared');

module.exports = async (req,res) => {
  if(req.method!=='GET') return sendJson(res,405,{error:'Method not allowed'});
  return sendJson(res,200,{
    ok:true,
    firebaseServiceAccountConfigured:Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    razorpayKeyIdConfigured:Boolean(process.env.RAZORPAY_KEY_ID),
    razorpayKeySecretConfigured:Boolean(process.env.RAZORPAY_KEY_SECRET),
    razorpayWebhookSecretConfigured:Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    adminEmailConfigured:Boolean(process.env.ADMIN_EMAIL)
  });
};
