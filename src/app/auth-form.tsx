import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isGoogleAuthConfigured } from "@/auth-config";
import BrandIcon from "./brand-icon";
import { signInWithGoogle, signOutOfCartonLab } from "./auth-actions";

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
            <p>Preparing your secure Google sign-in.</p>
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

export default async function AuthForm({ mode, error }: AuthFormProps) {
  const isSignup = mode === "signup";
  const configured = isGoogleAuthConfigured();
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
                ? "Create your CartonLab account with Google."
                : "Sign in securely with your Google account."}
            </p>
          </div>
          {isUnverifiedEmailError && (
            <p className="auth-config-notice" role="alert">
              Your Google sign-in succeeded, but your account&apos;s verification
              status was out of date. Sign out and sign back in to refresh it.
            </p>
          )}
          {session?.user ? (
            <div className="auth-signed-in">
              <p>
                Signed in as <b>{session.user.name || session.user.email}</b>
              </p>
              <Link href="/app" className="button auth-submit">
                Open the designer <span>→</span>
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
                  Google did not confirm a verified email address, so access
                  was denied. Sign in with a Google account that has a verified
                  email.
                </p>
              )}
              <form action={signInWithGoogle} className="google-auth-form">
                <button
                  type="submit"
                  className="google-button"
                  disabled={!configured}
                >
                  <GoogleMark />
                  {isSignup ? "Sign up with Google" : "Continue with Google"}
                </button>
              </form>
              {!configured && (
                <p className="auth-config-notice" role="status">
                  Google sign-in is not ready yet. Configure AUTH_SECRET,
                  AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, and POSTGRES_PRISMA_URL.
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
            <span>◇</span> Google-only sign-in. Your password is never shared with CartonLab.
          </div>
        </div>
        <p className="auth-footnote">
          Design confidently. Get the dimensions right. Make something that fits.
        </p>
      </section>
    </main>
  );
}
