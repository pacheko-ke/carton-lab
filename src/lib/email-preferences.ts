import { createHmac, timingSafeEqual } from "node:crypto";
import { getApplicationUrl } from "@/lib/billing";

function getEmailTokenSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be configured for email preferences.");
  }
  return secret;
}

export function createEmailPreferenceToken(userId: string) {
  const signature = createHmac("sha256", getEmailTokenSecret())
    .update(userId)
    .digest("hex");
  return `${userId}.${signature}`;
}

export function verifyEmailPreferenceToken(token: string) {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const userId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^[0-9a-f]{64}$/.test(signature)) return null;

  const expected = createHmac("sha256", getEmailTokenSecret())
    .update(userId)
    .digest();
  const provided = Buffer.from(signature, "hex");
  return timingSafeEqual(expected, provided) ? userId : null;
}

export function getEmailPreferencesUrl(userId: string) {
  const url = new URL("/email-preferences", getApplicationUrl());
  url.searchParams.set("token", createEmailPreferenceToken(userId));
  return url.toString();
}
