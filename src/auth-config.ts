function isAuthStorageConfigured() {
  return Boolean(process.env.AUTH_SECRET && process.env.POSTGRES_PRISMA_URL);
}

export function isGoogleAuthConfigured() {
  return Boolean(
    isAuthStorageConfigured() &&
      process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET,
  );
}

export function isEmailOtpConfigured() {
  return Boolean(
    isAuthStorageConfigured() &&
      process.env.RESEND_API_KEY &&
      process.env.RESEND_FROM_EMAIL,
  );
}

export function isAuthConfigured() {
  return isGoogleAuthConfigured() || isEmailOtpConfigured();
}
