# CartonLab Lightweight 2.0

Website version of CartonLab, built with Next.js and Tailwind CSS. The Next.js
home page is a product landing page. The carton keyline application is available
at `/app`; its original UI and browser-based features are served from
`public/cartonlab`.

The `/login` and `/signup` pages use Google OAuth through Auth.js. Google
accounts are saved in PostgreSQL through Prisma. New users can sign in only when
Google returns a verified email; access to `/app` and its assets is checked
against the verified user record.

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
