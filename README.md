# PackStudio

Next.js and Tailwind CSS. The Next.js
home page is a product landing page. The carton keyline application is available
at `/app`; its original UI and browser-based features are served from
`public/packstudio`.
Verified users can bookmark the current keyline and its settings in the Studio;
bookmarks are saved to their account and can be reopened or removed later.
After a verified user has opened the Studio online, its editor shell, permitted
keyline catalog, and bookmarks are cached on that device. The Studio can then
reopen at `/app` offline; offline bookmark additions and removals are queued and
synced to that account when the Studio is online again. Bulk spreadsheet
processing, account changes, and other server-backed actions still require a
connection.

The `/login` and `/signup` pages support Google OAuth. Passwordless email
sign-in with a one-time verification code is disabled by default; set
`EMAIL_OTP_ENABLED=true` to enable it. When enabled, codes are sent through
Resend, expire after 10 minutes, and are limited to five verification attempts
and three requests per email per 15 minutes, with a 10-request per network
limit over the same period. Accounts are saved in PostgreSQL through Prisma,
and access to `/app` and its assets is checked against the verified user
record. New accounts receive a colorful welcome email through Resend. Verified
admin addresses in `ADMIN_EMAILS` receive alerts for
new accounts, successful or failed payments, and subscription starts, renewals,
payment issues, and cancellations. Payment and subscription alerts go to the
affected user and admins. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` locally
and in Vercel; the sender address must use a domain verified with Resend.
`APP_URL` sets the destination of the welcome email's Studio link. Resend
delivery failures are logged without preventing account creation or payment
processing.

The current production hostname remains `cartonlab-web.vercel.app` until a
PackStudio domain is configured. Update the Google OAuth redirect URLs, Paystack
webhook URL, and `APP_URL` when changing the production hostname.

Premium feature announcements and product updates are enabled by default for
new accounts. Existing accounts without a saved email preference are enabled
when the marketing email migration is applied; saved opt-outs are preserved.
Users can turn these messages off from `/account`. Promotional emails are sent
only to verified users who have not opted out. Premium announcements target
Premium members, while Free promotions exclude active trials. Every
promotional email includes an unsubscribe link, and users can also unsubscribe
from their account preferences. Welcome and trial-ending emails are account
lifecycle messages. Trial reminders are queued three days before the trial
end date; the end-date Premium offer is sent only when marketing emails remain
enabled.

The daily Vercel Cron job at `/api/cron/email-jobs` sends queued messages and
backfills trial reminders. It runs at 7 a.m. UTC (10 a.m. in Nairobi). Set a
strong `CRON_SECRET` in Vercel and locally when testing the endpoint; Vercel
sends it as a bearer token. The worker sends between 9 a.m. and 6 p.m.
`Africa/Nairobi` time. Trial job dates also use `Africa/Nairobi`. Campaigns
created from `/admin` are queued for eligible Premium or Free audiences and
processed by this worker.

## System metrics

The `/admin` dashboard shows account verification, Premium access, subscription
health, recent checkouts, and confirmed payment activity. It is restricted to
verified Google accounts listed in the comma-separated `ADMIN_EMAILS`
environment variable; without an allowlist, access is denied. Configure the
same setting locally and in Vercel for each administrator.

Confirmed Paystack card charges and provider-verified Daraja M-Pesa successes
and failures are recorded after the billing-payment migration is deployed.
Historical payment records were not retained, so payment totals start
accumulating after deployment. Subscribe the Paystack webhook to
`charge.success` and `charge.failed` in addition to the subscription and
invoice events listed below.

## Plans and billing

New accounts receive a seven-day Premium trial without entering payment
details. The trial starts when the account is created; after it expires, the
account returns to Free unless the user subscribes. Accounts that already
exist when this change is deployed do not receive a trial. Free accounts can
use RSC, Pizza, and Chicken Box keylines; Premium keyline definitions are
served only when a verified payment, active subscription, or trial grants
access. Premium is $5 USD per month and includes every keyline, dimension
markings, and carton colour options. Free accounts cannot show dimension
markings or change the carton colour, which defaults to brown. Recurring card
billing is handled by Paystack. New Daraja M-Pesa checkouts are temporarily
disabled; callbacks for any already-started payments continue to be verified,
and existing paid periods remain valid until they expire. The `/account` page
shows plan details and links to the separate profile editor at
`/account/profile`. Account holders can update their name, role, contact, and
address; company name can be set once and is then locked.

1. In Paystack, create an active **$5 USD monthly** payment plan. Paystack
   amounts use the currency's subunit, so the plan amount is 500 cents.
2. Set `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_CODE`, and
   `PAYSTACK_WEBHOOK_SECRET` in the local environment and Vercel.
3. Configure the Paystack webhook URL as
   `https://cartonlab-web.vercel.app/api/paystack/webhook`. Subscribe to
   `subscription.create`, `subscription.not_renew`, `subscription.disable`,
   `invoice.update`, `invoice.payment_failed`, `charge.success`, and
   `charge.failed`.
4. Apply the Prisma migrations with `npx prisma migrate deploy`. Vercel
   production builds apply pending migrations automatically.

Existing Flutterwave subscriptions cannot be transferred to Paystack. Cancel
any live Flutterwave subscriptions in its dashboard before retiring the old
integration; customers must complete a new Paystack checkout.

Daraja callback verification for already-started M-Pesa checkouts requires a
Lipa Na M-Pesa Online app in the Safaricom Daraja portal and the
`DARAJA_ENV`, `DARAJA_CONSUMER_KEY`,
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

Each M-Pesa checkout records its USD/KES quote, rate date, and KES charge for
callback verification. Premium is not granted from a browser redirect: the
Daraja callback is checked against the STK Push query API before access is
activated. This callback processing remains enabled for checkouts already in
progress, but new M-Pesa checkouts are disabled. Card subscriptions are
activated only after Paystack confirms the active subscription and plan.
Renewal, failed payment, and cancellation events update the local subscription;
scheduled cancellations retain access through the paid period end.

## Configure sign-in

1. Provision a PostgreSQL database and set `POSTGRES_PRISMA_URL` to its pooled
   connection string and `POSTGRES_URL_NON_POOLING` to its direct connection
   string. The Vercel project can use the Prisma Postgres Marketplace
   integration; its terms must first be accepted by a project owner in Vercel.
2. To enable Google sign-in, create a Google OAuth client ID for a Web
   application in Google Cloud Console and add these authorized redirect URIs:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://cartonlab-web.vercel.app/api/auth/callback/google`
3. Copy `.env.example` to `.env.local`, generate an `AUTH_SECRET` with
   `npx auth secret`, and set the credentials for the sign-in methods you want:

   ```text
   AUTH_SECRET=<generated secret>
   AUTH_GOOGLE_ID=<Google OAuth client ID>
   AUTH_GOOGLE_SECRET=<Google OAuth client secret>
   EMAIL_OTP_ENABLED=false
   POSTGRES_PRISMA_URL=<Pooled PostgreSQL connection string for the app>
   POSTGRES_URL_NON_POOLING=<Direct PostgreSQL connection string for migrations>
   ADMIN_EMAILS=<verified admin email addresses, comma-separated>
   RESEND_API_KEY=<Resend API key>
   RESEND_FROM_EMAIL="PackStudio <hello@your-verified-domain.com>"
   CRON_SECRET=<long random secret>
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

4. Apply the schema locally with `npx prisma migrate deploy`. Prisma uses
   `POSTGRES_URL_NON_POOLING` for migrations to avoid advisory-lock timeouts on
   pooled connections. Vercel production builds automatically run this command
   before building the app. Configure only live Daraja credentials in Vercel
   Production (`DARAJA_ENV=production`); keep sandbox credentials local.

The Production workspace is available at `/production/admin`, with
organization-filtered job KPIs, workflow queues, and delivery visualizations.
Jobs are shared with explicitly assigned organization members managed by a
system admin at `/admin/production`. Verified system admins listed in
`ADMIN_EMAILS` can access every organization and production module regardless
of membership role. Production members create and update jobs;
Order Bookers can enter basic customer orders into the Order Booking workflow
without editing job sheets. The dashboard provides quick actions to create
products and shared customer records. They can create organization-specific
catalog items with automatically generated item codes and a selectable carton
type from the available keyline catalog, plus paper combination and dimensions.
Each product is linked to a customer; booking the product preselects that
customer, which can still be changed for the order. Customer records are shared
across organizations and store the customer name plus optional contact person,
phone, email, and address. Designers can view planned
jobs in Origination and attach artwork files up to 5 MB without editing their
job sheets. Designers can also flag a job with a reason; Production members can
review and clear active flags. Production members can schedule job operations
by work center, planned quantity, time range, and status; overlapping active
schedules for the same work center are rejected. The Shop floor execution
workspace records good and rejected quantities against scheduled operations,
tracks each report with the signed-in operator and timestamp, and can mark an
operation complete. Artwork requires a **private**
Vercel Blob store connected to the project in Development, Preview, and
Production. Vercel
supplies `BLOB_STORE_ID` and OIDC credentials; for local development, connect
the Development store and refresh the environment with `vercel env pull`. Do not
use a public Blob store for production artwork.

The Procurement workspace tracks organization-specific materials and suppliers,
purchase orders, and partial goods receipts. Receipts create auditable stock
movements. Inventory shows ledger-derived on-hand quantities and reorder points;
job-linked material issues track raw-material consumption into WIP, and stock
issues are rejected when they would make inventory negative.

Paper Reel Traceability registers received paper against an organization paper
grade and, optionally, a received purchase-order line. Reels receive generated
IDs and barcodes and retain supplier batch, width, GSM, storage location, and
parent/remnant lineage. Job issues and returns are job-linked and update both
the reel ledger and material stock; remnant splits transfer weight between reel
records without counting stock twice. Paper stock cannot be issued or adjusted
through the generic material form.

Quality Management records incoming, in-process, final, and customer-return
inspections against jobs and optional scheduled operations. Each inspection
captures carton checkpoints, targets, observed results, sample and reject
quantities, and inspector. Failed checks automatically open a severity-ranked
nonconformance; Production members can document root cause, disposition, and
corrective action, then close it with verification notes. Inspection and
nonconformance registers are organization-scoped and retain operator and
resolution attribution.

Warehouse & Dispatch receives finished cartons only after a completed Packing
report, a passing final inspection, and resolution of open nonconformances.
Receipts create uniquely labeled pallets with bay/location and available
quantities bounded by packed output and the order quantity. Dispatches assign a
vehicle, driver, and route, create a printable delivery note, and decrement
pallet balances transactionally. Delivery confirmation records the recipient's
typed acknowledgement and delivery notes.

Invoicing & Collections issues one invoice per delivered dispatch using the
converted quote price where available; legacy orders require an explicit unit
price and currency. Payments are append-only and support partial collection,
while reasoned credit notes reduce only the outstanding balance. Customer
statements and aging buckets are available by currency. Tax calculation and
KRA eTIMS submission are intentionally not configured; verify current
requirements before treating these records as statutory tax invoices.

Tooling Management tracks organization-owned and customer-owned dies, print
plates, cylinders, and anilox rolls. Each record includes its storage location,
availability/maintenance/retired status, usage count, wear notes, and append-only
usage, repair, inspection, and status history. Job-linked usage is limited to
available tools and increments the usage count transactionally.

Maintenance (CMMS) registers machine/work-center assets, recurring preventive
plans, breakdown and scheduled-maintenance tickets, linked downtime, and
resolution history. Spare parts are issued from active non-paper inventory to
open tickets through the stock ledger with a serializable balance check.
Downtime can be linked to a scheduled operation and job; a complete OEE
calculation remains pending runtime and ideal-speed capture.

HR & Safety maintains employee records, production shift rosters, attendance
and explicitly recorded overtime, pending leave approvals, and safety-training
completion and expiry. Payroll calculations, statutory deductions, and
production-incentive rules are intentionally excluded until their policies are
verified and approved.

Costing & Quotes supports customer/RFQ references, multi-item quotations, and
versioned quote revisions. Cost estimates use an explicitly entered developed
board area, board GSM, paper cost per kilogram, trim-waste allowance, conversion
and consumables costs, and gross margin; carton area is never inferred from
external dimension assumptions. Drafts can be submitted for Production
approval, rejected with a reason, or approved and converted into order-booking
jobs using the customer's PO and delivery dates. Quote lines retain product
specification and costing snapshots, and expiry and approval attribution are
shown in the quote register.

For local Origination demos, set `PACKSTUDIO_ALLOW_LOCAL_DEMO_SEED=true` and
`DEMO_USER_EMAIL` for a verified local account in `.env.local`, then run
`npm run seed:production-demo`. This creates an isolated demo organization,
adds that account as a Designer, and seeds two planned job sheets. The script
is opt-in and refuses to run in production.

Email-code sign-in additionally requires `EMAIL_OTP_ENABLED=true`,
`RESEND_API_KEY`, and `RESEND_FROM_EMAIL`; Google sign-in requires the Google
OAuth credentials above. Never commit `.env.local` or expose provider secrets
in browser code. Billing remains unavailable until its provider credentials
are configured.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use `npm run lint` and `npm run build` to validate the website.
