# Contributing to PackStudio

Thanks for helping improve PackStudio. This guide covers the project-specific
workflow for proposing and validating changes.

## Getting started

1. Fork the repository and create a branch from the default branch. Use a
   descriptive name, such as `fix/bookmark-sync`.
2. Install dependencies with `npm install`.
3. Configure local environment variables as described in the
   [README](./README.md). Keep secrets in `.env.local`; never commit them.
4. Start the development server with `npm run dev`.

## Making changes

- Keep changes focused and follow the existing patterns and formatting.
- Preserve the behavior of the Studio, account and billing flows unless the
  change explicitly requires otherwise.
- If changing the database schema, add a Prisma migration under
  `prisma/migrations/` and include the related application changes. Do not edit
  migrations that have already been applied.
- Do not include credentials, personal data, or generated build artifacts in
  your changes.

## Before opening a pull request

Run the linter:

```bash
npm run lint
```

When your local database is configured, also run the production build:

```bash
npm run build
```

The build script runs database migrations when `VERCEL_ENV=production`. Do not
set that value for a routine local build unless you intend to run migrations
against the configured database.

In your pull request, summarize the change, explain any relevant behavior or
schema changes, and include the checks you ran. Add screenshots for user-facing
visual changes when useful.
