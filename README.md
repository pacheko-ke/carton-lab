# CartonLab Lightweight 2.0

Website version of CartonLab, built with Next.js and Tailwind CSS. The Next.js
home page is a product landing page. The carton keyline application is available
at `/app`; its original UI and browser-based features are served from
`public/cartonlab`.

The `/login` and `/signup` pages use Google OAuth through Auth.js. Google
accounts are saved in PostgreSQL through Prisma. New users can sign in only when
Google returns a verified email; access to `/app` and its assets is checked
against the verified user record.

## Plans and Flutterwave billing

Every verified account starts on the Free plan. Free accounts can use RSC,
Pizza, and Chicken Box keylines; Premium keyline definitions are served only
after a Flutterwave transaction and active subscription are verified. Premium
is $5 USD per month and includes every keyline. Recurring billing is card-only;
Flutterwave payment plans do not support recurring M-Pesa. The `/account` page
shows the verified plan and its limits and lets subscribers cancel their plan.

1. In Flutterwave, create an active **$5 USD monthly** payment plan. The plan
   currency, amount, and interval must match exactly.
2. Set `FLW_SECRET_KEY`, `FLW_PUBLIC_KEY`, and `FLW_PAYMENT_PLAN_ID` in the
   local environment and Vercel Production. Set `APP_URL` to the canonical app
   URL when it differs from `https://cartonlab-web.vercel.app`.
3. Configure the Flutterwave webhook URL as
   `https://cartonlab-web.vercel.app/api/flutterwave/webhook`, enable
   `charge.completed` and `subscription.cancelled`, and set the webhook secret
   hash to `FLW_SECRET_HASH` in the local environment and Vercel Production.
4. Apply the Prisma migration with `npx prisma migrate deploy`. Vercel
   production builds apply pending migrations automatically.

Billing stays unavailable until all four Flutterwave variables are
configured. The app does not grant Premium based on a checkout return URL;
only a secret-hash-verified webhook followed by server-side transaction and
subscription verification can activate the plan. Cancelled subscriptions
retain access through their paid period end.

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
   FLW_SECRET_KEY=<Flutterwave secret key>
   FLW_PUBLIC_KEY=<Flutterwave public key>
   FLW_PAYMENT_PLAN_ID=<Flutterwave plan ID for $5 USD per month>
   FLW_SECRET_HASH=<Flutterwave webhook secret hash>
   ```

5. Apply the schema locally with `npx prisma migrate deploy`. Vercel production
   builds automatically run this command using `POSTGRES_PRISMA_URL` before
   building the app. Add the environment variables to Vercel Production and
   redeploy.

Never commit `.env.local` or expose the Google client secret in browser code.
Without these values, Google sign-in stays disabled and the auth pages show a
configuration notice.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use `npm run lint` and `npm run build` to validate the website.
