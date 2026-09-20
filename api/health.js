const {sendJson}=require('../lib/shared');

module.exports = async (req,res) => {
  if(req.method!=='GET') return sendJson(res,405,{error:'Method not allowed'});
  return sendJson(res,200,{
    ok:true,
    firebaseServiceAccountConfigured:Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    cashfreeAppIdConfigured:Boolean(process.env.CASHFREE_APP_ID),
    cashfreeSecretKeyConfigured:Boolean(process.env.CASHFREE_SECRET_KEY),
    cashfreeWebhookSecretConfigured:Boolean(process.env.CASHFREE_WEBHOOK_SECRET||process.env.CASHFREE_SECRET_KEY),
    adminEmailConfigured:Boolean(process.env.ADMIN_EMAIL)
  });
};
