import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  isAppleAuthConfigured,
  isAuthConfigured,
  isGoogleAuthConfigured,
} from "@/auth-config";
import BrandIcon from "./brand-icon";
import {
  signInWithApple,
  signInWithGoogle,
  signOutOfCartonLab,
} from "./auth-actions";

type AuthFormProps = {
  mode: "login" | "signup";
  error?: string | string[];
};

export function AuthLoading() {
  return (
    <main className="auth-page">
      <section className="auth-content">
        <div className="auth-card">
          <div className="auth-card-top">
            <div className="auth-mini-mark">
              <BrandIcon className="auth-mini-mark-image" />
            </div>
            <div className="eyebrow"><span /> YOUR PACKAGING WORKSPACE</div>
            <h1>Loading sign-in…</h1>
            <p>Preparing your secure sign-in.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark">
      <BrandIcon className="brand-mark-image" />
    </span>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="google-mark" viewBox="0 0 48 48">
      <path
        fill="#4285F4"
        d="M43.61 20.08H42V20H24v8h11.3c-1.65 4.66-6.07 8-11.3 8-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 5.05 29.27 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.34-.14-2.65-.39-3.92Z"
      />
      <path
        fill="#FBBC05"
        d="M6.31 14.69 12.88 19.5C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 5.05 29.27 3 24 3 16.01 3 9.14 7.42 6.31 14.69Z"
      />
      <path
        fill="#34A853"
        d="M24 45c5.17 0 9.86-1.98 13.41-5.2l-6.19-5.24C29.16 36.14 26.72 37 24 37c-5.22 0-9.63-3.31-11.29-7.95l-6.52 5.03C9 40.56 16 45 24 45Z"
      />
      <path
        fill="#EA4335"
        d="M43.61 20.08H42V20H24v8h11.3c-.79 2.24-2.23 4.17-4.08 5.57l6.19 5.24C36.97 39.63 45 33 45 24c0-1.34-.14-2.65-.39-3.92Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg aria-hidden="true" className="apple-mark" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M16.37 12.21c.02 2.09 1.83 2.79 1.85 2.8-.02.05-.29 1-.95 1.98-.57.84-1.17 1.68-2.1 1.7-.92.02-1.22-.55-2.28-.55-1.07 0-1.4.53-2.27.57-.91.03-1.6-.91-2.18-1.74-1.19-1.72-2.1-4.86-.88-6.99.6-1.06 1.67-1.74 2.83-1.75.88-.02 1.71.6 2.25.6.54 0 1.55-.74 2.62-.63.45.02 1.72.18 2.53 1.36-.07.05-1.51.88-1.42 2.65ZM14.65 7.3c.48-.58.8-1.39.71-2.2-.69.03-1.53.46-2.03 1.03-.45.51-.84 1.33-.73 2.12.77.06 1.56-.39 2.05-.95Z"
      />
    </svg>
  );
}

export default async function AuthForm({ mode, error }: AuthFormProps) {
  const isSignup = mode === "signup";
  const googleConfigured = isGoogleAuthConfigured();
  const appleConfigured = isAppleAuthConfigured();
  const configured = isAuthConfigured();
  const session = configured ? await auth() : null;
  const isUnverifiedEmailError =
    error === "UnverifiedEmail" ||
    (Array.isArray(error) && error.includes("UnverifiedEmail"));

  if (session?.user.isEmailVerified) {
    redirect("/app");
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration" aria-hidden="true">
        <span className="auth-line auth-line-one" />
        <span className="auth-line auth-line-two" />
        <span className="auth-orb" />
        <span className="auth-grid" />
      </div>
      <header className="auth-header">
        <Link href="/" className="brand-lockup" aria-label="CartonLab home">
          <BrandMark />
          <span>CartonLab Lightweight 2.0</span>
        </Link>
        <Link href="/" className="back-link">← Back to home</Link>
      </header>
      <section className="auth-content">
        <div className="auth-card">
          <div className="auth-card-top">
            <div className="auth-mini-mark">
              <BrandIcon className="auth-mini-mark-image" />
            </div>
            <div className="eyebrow"><span /> YOUR PACKAGING WORKSPACE</div>
            <h1>{isSignup ? "Start making." : "Welcome back."}</h1>
            <p>
              {isSignup
                ? "Create your CartonLab account with Google or Apple."
                : "Sign in securely with Google or Apple."}
            </p>
          </div>
          {isUnverifiedEmailError && (
            <p className="auth-config-notice" role="alert">
              Your sign-in succeeded, but your account&apos;s verification
              status was out of date. Sign out and sign back in to refresh it.
            </p>
          )}
          {session?.user ? (
            <div className="auth-signed-in">
              <p>
                Signed in as <b>{session.user.name || session.user.email}</b>
              </p>
              <Link href="/app" className="button auth-submit">
                Open the Studio <span>→</span>
              </Link>
              <form action={signOutOfCartonLab}>
                <button type="submit" className="auth-signout">Sign out</button>
              </form>
            </div>
          ) : (
            <>
              {(error === "AccessDenied" ||
                (Array.isArray(error) && error.includes("AccessDenied"))) && (
                <p className="auth-config-notice" role="alert">
                  Your provider did not confirm a verified email address, so
                  access was denied. Sign in with an account that has a
                  verified email.
                </p>
              )}
              <div className="auth-provider-buttons">
                <form action={signInWithGoogle}>
                  <button
                    type="submit"
                    className="auth-provider-button google-button"
                    disabled={!googleConfigured}
                  >
                    <GoogleMark />
                    {isSignup ? "Sign up with Google" : "Continue with Google"}
                  </button>
                </form>
                <form action={signInWithApple}>
                  <button
                    type="submit"
                    className="auth-provider-button apple-button"
                    disabled={!appleConfigured}
                  >
                    <AppleMark />
                    {isSignup ? "Sign up with Apple" : "Continue with Apple"}
                  </button>
                </form>
              </div>
              {!configured && (
                <p className="auth-config-notice" role="status">
                  Sign-in is not ready yet. Configure AUTH_SECRET,
                  POSTGRES_PRISMA_URL, and credentials for Google or Apple.
                </p>
              )}
            </>
          )}
          <div className="auth-switch">
            {isSignup ? "Already have an account?" : "New to CartonLab?"}{" "}
            <Link href={isSignup ? "/login" : "/signup"}>
              {isSignup ? "Log in" : "Create an account"}
            </Link>
          </div>
          <div className="auth-privacy">
            <span>◇</span> Sign in with Google or Apple. Your password is never shared with CartonLab.
          </div>
        </div>
        <p className="auth-footnote">
          Design confidently. Get the dimensions right. Make something that fits.
        </p>
      </section>
    </main>
  );
}
