import { timingSafeEqual } from "node:crypto";
import {
  backfillRecentTrialEmailJobs,
  processEmailJobs,
} from "@/lib/email-jobs";

export const maxDuration = 300;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { error: "CRON_SECRET must be configured." },
      { status: 503 },
    );
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return Response.json(
      { error: "RESEND_API_KEY and RESEND_FROM_EMAIL must be configured." },
      { status: 503 },
    );
  }

  await backfillRecentTrialEmailJobs();
  const result = await processEmailJobs();
  return Response.json(result);
}
