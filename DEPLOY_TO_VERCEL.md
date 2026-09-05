# Deploy to Vercel (from your phone)

This version has been converted from Netlify Functions to Vercel Serverless
Functions. The backend endpoints now live in `/api/*.js` and are picked up
automatically — no `netlify.toml` or redirects file needed.

## 1. Push this project to GitHub

1. Go to github.com → **New repository** → name it (e.g. `all-competition-breaker`).
2. Upload every file and folder from this project, keeping the structure:
   - `index.html`
   - `api/` (with all the `.js` files inside)
   - `lib/shared.js`
   - `package.json`
   - `firestore.rules`, `robots.txt`, `sitemap.xml`, `upi-qr.png`, `.gitignore`, `.env.example`
3. Commit the files.

## 2. Import into Vercel

1. Go to vercel.com → sign up/log in (you can use your GitHub account directly).
2. Tap **Add New → Project**.
3. Select your GitHub repo.
4. Framework preset: leave as **Other** (no build step needed).
5. Tap **Deploy**.

## 3. Add environment variables

In your Vercel project: **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay Test/Live Key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay Test/Live Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Secret you choose for the Razorpay webhook |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Complete Firebase Admin service-account JSON |
| `ADMIN_EMAIL` | (optional) your admin email for the admin panel |

After adding variables, go to **Deployments** and redeploy (or push a small change to trigger a new build) so the functions pick up the new variables.

## 4. Firebase setup (same as before)

1. Firebase Console → Authentication → Sign-in method → enable Email/Password.
2. Authentication → Settings → Authorized domains → add your new `*.vercel.app` domain.
3. Keep your Firestore rules and service account as they were.

## 5. Razorpay webhook

In the Razorpay Dashboard, add a webhook:

`https://YOUR-PROJECT.vercel.app/api/razorpay-webhook`

Use the same secret as `RAZORPAY_WEBHOOK_SECRET`, and enable:
- `payment.captured`
- `order.paid`

## 6. Test

1. Open `https://YOUR-PROJECT.vercel.app/api/health` — you should see JSON like:
   `{"ok":true,"firebaseServiceAccountConfigured":true,...}`
   If any field says `false`, that variable isn't set yet in Vercel.
2. Open your site, sign in, and try buying an item.
3. Razorpay Checkout should open, and after a successful test payment the purchase should unlock automatically.

## Notes

- No `vercel.json` is required — Vercel auto-detects `/api/*.js` as serverless functions and serves everything else as static files.
- If a Razorpay Key Secret has ever been shared publicly (chat, screenshot, repo), rotate it in the Razorpay Dashboard before going live.
