# CartonLab Lightweight 2.0

Website version of CartonLab, built with Next.js and Tailwind CSS. The Next.js
home page is a product landing page. The carton keyline application is available
at `/app`; its original UI and browser-based features are served from
`public/cartonlab`.

The `/login` and `/signup` pages use Google OAuth through Auth.js. Google
accounts are saved in PostgreSQL through Prisma. New users can sign in only when
Google returns a verified email; access to `/app` and its assets is checked
against the verified user record.

## Plans and billing

Every verified account starts on the Free plan. Free accounts can use RSC,
Pizza, and Chicken Box keylines; Premium keyline definitions are served only
after a payment is verified (and, for card billing, its active subscription
is confirmed). Premium is $5 USD per month and includes every keyline.
Recurring billing is card-only through Flutterwave. Daraja M-Pesa
checkout is a one-time payment for one month, so customers renew manually. Its
KES amount is calculated at checkout from the latest available USD/KES
reference rate and rounded to the nearest whole shilling. The `/account` page
shows the verified plan and its limits.

1. In Flutterwave, create an active **$5 USD monthly** payment plan. The plan
   currency, amount, and interval must match exactly.
2. Set `FLW_SECRET_KEY` and `FLW_SECRET_HASH` in the local environment and
   Vercel. To enable recurring card billing, also set
   `FLW_PAYMENT_PLAN_ID` to the active $5 USD monthly plan.
3. Configure the Flutterwave webhook URL as
   `https://cartonlab-web.vercel.app/api/flutterwave/webhook`, enable
   `charge.completed` and `subscription.cancelled`, and set the webhook secret
   hash to `FLW_SECRET_HASH` in the local environment and Vercel Production.
4. Apply the Prisma migration with `npx prisma migrate deploy`. Vercel
   production builds apply pending migrations automatically.

For Daraja M-Pesa, create a Lipa Na M-Pesa Online app in the Safaricom Daraja
portal and set `DARAJA_ENV`, `DARAJA_CONSUMER_KEY`,
`DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, and
`DARAJA_CALLBACK_URL` from that app. The callback URL must be a public HTTPS
endpoint ending in `/api/daraja/callback`; for local sandbox testing, expose
the local app through an HTTPS tunnel. There are no shared universal Daraja
API credentials. Sandbox payments are disabled in production, so test
credentials cannot grant production Premium access. Use Daraja's sandbox test
phone and instructions for STK Push simulation.
Set `DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline` if the business shortcode
is a Buy Goods/Till number; the default is `CustomerPayBillOnline`.

The USD/KES quote is fetched without caching for each M-Pesa checkout and its
rate, date, and KES charge are recorded for callback verification. Frankfurter
provides published reference rates, not live settlement quotes; checkout
fails if the service is unavailable or its latest rate is more than seven
days old. Premium is not granted from a browser redirect: the Daraja callback
is checked against the STK Push query API before access is activated. Card
subscriptions also require Flutterwave transaction and subscription
verification. Cancelled card subscriptions retain access through their paid
period end.

## Configure Google sign-in

1. Provision a PostgreSQL database and set its `POSTGRES_PRISMA_URL`. The Vercel
   project can use the Prisma Postgres Marketplace integration; its terms must
   first be accepted by a project owner in Vercel.
2. Create a Google OAuth client ID for a Web application in Google Cloud
   Console.
3. Add these authorized redirect URIs to the OAuth client:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://cartonlab-web.vercel.app/api/auth/callback/google`
4. Copy `.env.example` to `.env.local`, generate an `AUTH_SECRET` with
   `npx auth secret`, and set the Google client ID and secret:

   ```text
   AUTH_SECRET=<generated secret>
   AUTH_GOOGLE_ID=<Google OAuth client ID>
   AUTH_GOOGLE_SECRET=<Google OAuth client secret>
   POSTGRES_PRISMA_URL=<PostgreSQL connection string>
   FLW_SECRET_KEY=<Flutterwave server-side secret key>
   FLW_PAYMENT_PLAN_ID=<Flutterwave plan ID for $5 USD per month>
   FLW_SECRET_HASH=<Flutterwave webhook secret hash>
   DARAJA_ENV=sandbox
   DARAJA_CONSUMER_KEY=<Daraja consumer key>
   DARAJA_CONSUMER_SECRET=<Daraja consumer secret>
   DARAJA_SHORTCODE=<Daraja business shortcode>
   DARAJA_PASSKEY=<Daraja Lipa Na M-Pesa passkey>
   DARAJA_TRANSACTION_TYPE=CustomerPayBillOnline
   DARAJA_CALLBACK_URL=<public HTTPS URL ending in /api/daraja/callback>
   ```

5. Apply the schema locally with `npx prisma migrate deploy`. Vercel production
   builds automatically run this command using `POSTGRES_PRISMA_URL` before
   building the app. Configure only live Daraja credentials in Vercel
   Production (`DARAJA_ENV=production`); keep sandbox credentials local.

Never commit `.env.local` or expose the Google client secret in browser code.
Without the auth and database values, Google sign-in stays disabled. Billing
remains unavailable until its provider credentials are configured.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use `npm run lint` and `npm run build` to validate the website.
