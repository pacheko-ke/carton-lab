# CartonLab Lightweight 2.0

Next.js and Tailwind CSS. The Next.js
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
Recurring card billing is handled by Paystack. Daraja M-Pesa
checkout is a one-time payment for one month, so customers renew manually. Its
KES amount is calculated at checkout from the latest available USD/KES
reference rate and rounded to the nearest whole shilling. The `/account` page
shows the verified plan and its limits. Account holders can update their name,
role, contact, and address; company name can be set once and is then locked.

1. In Paystack, create an active **$5 USD monthly** payment plan. Paystack
   amounts use the currency's subunit, so the plan amount is 500 cents.
2. Set `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_CODE`, and
   `PAYSTACK_WEBHOOK_SECRET` in the local environment and Vercel.
3. Configure the Paystack webhook URL as
   `https://cartonlab-web.vercel.app/api/paystack/webhook`. Subscribe to
   `subscription.create`, `subscription.not_renew`, `subscription.disable`,
   `invoice.update`, and `invoice.payment_failed`.
4. Apply the Prisma migrations with `npx prisma migrate deploy`. Vercel
   production builds apply pending migrations automatically.

Existing Flutterwave subscriptions cannot be transferred to Paystack. Cancel
any live Flutterwave subscriptions in its dashboard before retiring the old
integration; customers must complete a new Paystack checkout.

For Daraja M-Pesa, create a Lipa Na M-Pesa Online app in the Safaricom Daraja
portal and set `DARAJA_ENV`, `DARAJA_CONSUMER_KEY`,
`DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, and
`DARAJA_CALLBACK_URL` from that app. The callback URL must be a public HTTPS
endpoint ending in `/api/daraja/callback`; for local sandbox testing, expose
the local app through an HTTPS tunnel. There are no shared universal Daraja
API credentials. Sandbox payments are hidden in production by default. For
temporary production testing, set `DARAJA_ENV=sandbox` and
`DARAJA_SANDBOX_TESTER_EMAIL` to the verified email of the one account allowed
to see and use sandbox checkout. Sandbox payments are simulated, not real
payments, and can activate Premium for that test account; remove the tester
email and redeploy when testing is complete. Use Daraja's sandbox test phone
and instructions for STK Push simulation.
Set `DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline` if the business shortcode
is a Buy Goods/Till number; the default is `CustomerPayBillOnline`.

The USD/KES quote is fetched without caching for each M-Pesa checkout and its
rate, date, and KES charge are recorded for callback verification. Frankfurter
provides published reference rates, not live settlement quotes; checkout
fails if the service is unavailable or its latest rate is more than seven
days old. Premium is not granted from a browser redirect: the Daraja callback
is checked against the STK Push query API before access is activated. Card
subscriptions are activated only after Paystack confirms the active
subscription and plan. Renewal, failed payment, and cancellation events update
the local subscription; scheduled cancellations retain access through the
paid period end.

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
   PAYSTACK_SECRET_KEY=<Paystack server-side secret key>
   PAYSTACK_PLAN_CODE=<Paystack plan code for $5 USD per month>
   PAYSTACK_WEBHOOK_SECRET=<Paystack webhook signing secret>
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
