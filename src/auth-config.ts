function hasAuthBaseConfiguration() {
  return Boolean(process.env.AUTH_SECRET && process.env.POSTGRES_PRISMA_URL);
}

export function isGoogleAuthConfigured() {
  return Boolean(
    hasAuthBaseConfiguration() &&
      process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET,
  );
}

export function isAppleAuthConfigured() {
  return Boolean(
    hasAuthBaseConfiguration() &&
      process.env.AUTH_APPLE_ID &&
      process.env.AUTH_APPLE_SECRET,
  );
}

export function isAuthConfigured() {
  return isGoogleAuthConfigured() || isAppleAuthConfigured();
}

export function hasVerifiedProviderEmail(
  provider: string | undefined,
  emailVerified: unknown,
) {
  return (
    (provider === "google" && emailVerified === true) ||
    (provider === "apple" &&
      (emailVerified === true || emailVerified === "true"))
  );
}
